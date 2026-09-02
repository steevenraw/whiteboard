/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Panier B (chantier whiteboard, 01/09) : post-it à texte riche (gras,
 * souligné, couleur sur sélection partielle) — impossible sur un élément
 * texte natif d'Excalidraw (voir mémoire du chantier : ExcalidrawTextElement
 * n'a pas de notion de segments stylés). Contournement retenu, arbitré par
 * l'utilisateur : rendre le post-it comme un vrai <div contenteditable> DOM
 * via le point d'extension "embeddable" (déjà utilisé par Embeddable.tsx
 * pour les cartes de référence Nextcloud). Compromis accepté explicitement :
 * ce post-it n'apparaît PAS dans "Exporter l'image" / "Capture d'écran"
 * (Excalidraw remplace tout embeddable par un placeholder à l'export,
 * comportement natif non contournable sans réécrire l'export lui-même).
 *
 * Le contenu riche (HTML), la couleur et la taille vivent dans
 * element.customData — sauvegardés via excalidrawAPI.updateScene() sur
 * changement (debounce), lu au montage. Ne PAS passer par
 * convertToExcalidrawElements pour fixer customData : ce helper perd ce
 * champ à la conversion (bug connu excalidraw/excalidraw#7654) — l'écrire
 * après coup sur l'élément converti, voir useQuickTools.tsx.
 *
 * Barres flottantes (formatage sur sélection, taille/couleur) rendues via
 * createPortal() — PAS comme enfants directs de la note. Cause trouvée par
 * audit direct (elementFromPoint aux coordonnées du bouton renvoyait le
 * canevas Excalidraw, pas le bouton) : la chaîne d'ancêtres empile DEUX
 * overflow:hidden au-dessus de la note (le nôtre, et le conteneur natif
 * Excalidraw .excalidraw__embeddable-container__inner). Toute barre
 * positionnée pour dépasser de la note (au-dessus, via un top négatif) est
 * donc rognée par ces deux couches — invisible ET non cliquable, même
 * quand son rendu React et sa géométrie calculée sont corrects.
 *
 * PIÈGE (trouvé après un premier essai de portail vers document.body qui
 * laissait le clic "mort" : le bouton est bien à l'endroit attendu
 * — elementFromPoint le confirme — mais le cliquer ne déclenche rien,
 * alors qu'appeler son onClick directement via les props React fonctionne
 * parfaitement). Cause : React 18 délègue ses écouteurs d'événements sur
 * le conteneur racine passé à createRoot() (ici #whiteboard-klsufg, le
 * conteneur du viewer Nextcloud), plus sur document comme avant React 17.
 * document.body est un ANCÊTRE de ce conteneur, pas un descendant : un
 * clic natif sur un nœud porté dans document.body remonte vers html/
 * document sans jamais traverser le conteneur racine, donc React ne le
 * voit jamais et onClick ne se déclenche pas — bug invisible en lecture de
 * code, seulement visible en testant le clic réel.
 * Fix : porter vers findPortalTarget() ci-dessous plutôt que document.body
 * — remonte depuis la note jusqu'au dernier ancêtre .excalidraw*, retourne
 * son parent (.App dans la structure actuelle). Ce nœud est à la fois
 * DANS l'arbre React (délégation OK) et AU-DESSUS des overflow:hidden
 * (affichage/hit-test OK). Coordonnées en position:'fixed' (viewport).
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useShallow } from 'zustand/react/shallow'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types'
import { useExcalidrawStore } from '../stores/useExcalidrawStore'
import { t } from '@nextcloud/l10n'

export const NOTE_COLORS: Record<string, string> = {
	canary: '#FFFF99',
	pink: '#F86398',
	teal: '#58D3D6',
	orange: '#FE8E45',
	coral: '#F8838A',
	green: '#BCDFC9',
	blue: '#A1C8E9',
	purple: '#E4DAE2',
}

export const NOTE_SIZES: Record<string, { w: number, h: number }> = {
	s: { w: 190, h: 136 },
	m: { w: 260, h: 188 },
	l: { w: 330, h: 240 },
}

interface RichStickyNoteElement {
	id: string
	width: number
	height: number
	customData?: {
		whiteboardNoteType?: string
		html?: string
		color?: string
	}
}

interface RichStickyNoteProps {
	element: RichStickyNoteElement
}

// Isolé dans son propre composant mémoïsé : le parent re-rend souvent
// (ouverture/fermeture des barres flottantes sur simple survol/sélection),
// et un <div contentEditable> sans enfants déclarés en JSX peut se faire
// réinitialiser par la réconciliation React au rendu suivant — annulant
// silencieusement toute modification DOM manuelle (range.surroundContents
// pour le gras/souligné) faite l'instant d'avant. Comparateur toujours
// vrai : ce nœud ne doit JAMAIS être re-rendu après son montage initial,
// le DOM contenteditable fait foi au-delà.
const EditableSurface = memo(function EditableSurface({
	textRef, onInput,
}: { textRef: React.RefObject<HTMLDivElement>, onInput: () => void }) {
	return (
		<div
			ref={textRef}
			contentEditable
			suppressContentEditableWarning
			onInput={onInput}
			style={{ outline: 'none', width: '100%', height: '100%', overflow: 'auto', fontSize: '15px', color: '#2a2a2a' }}
		/>
	)
}, () => true)

// Cherche l'ancêtre le plus haut dont la classe commence par "excalidraw",
// renvoie SON parent — voir le commentaire en tête de fichier pour le
// pourquoi (délégation d'événements React 18 + overflow:hidden imbriqués).
// Marche depuis n'importe quel nœud interne à Excalidraw, résiste à un
// changement de profondeur d'imbrication tant que la convention de nommage
// des classes internes d'Excalidraw reste stable.
function findPortalTarget(el: HTMLElement | null): Element {
	let node: HTMLElement | null = el
	let outermostExcalidrawAncestor: HTMLElement | null = null
	while (node && node !== document.body) {
		if ([...node.classList].some(c => c.startsWith('excalidraw'))) {
			outermostExcalidrawAncestor = node
		}
		node = node.parentElement
	}
	return outermostExcalidrawAncestor?.parentElement || document.body
}

export default function RichStickyNote({ element }: RichStickyNoteProps) {
	const { excalidrawAPI } = useExcalidrawStore(useShallow(state => ({
		excalidrawAPI: state.excalidrawAPI as (ExcalidrawImperativeAPI | null),
	})))

	const textRef = useRef<HTMLDivElement>(null)
	const noteRef = useRef<HTMLDivElement>(null)
	const [showTools, setShowTools] = useState(false)
	const [toolsPos, setToolsPos] = useState<{ top: number, left: number } | null>(null)
	const [selToolbar, setSelToolbar] = useState<{ top: number, left: number } | null>(null)
	const savedRangeRef = useRef<Range | null>(null)
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	const color = element.customData?.color || 'canary'
	const portalTarget = findPortalTarget(noteRef.current)

	// Charge le contenu existant au montage (une seule fois : au-delà, c'est
	// le DOM contenteditable qui fait foi tant que la note reste montée).
	useEffect(() => {
		if (textRef.current && element.customData?.html) {
			textRef.current.innerHTML = element.customData.html
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const persist = useCallback((patch: Partial<{ html: string, color: string, width: number, height: number }>) => {
		if (!excalidrawAPI) {
			return
		}
		const elements = excalidrawAPI.getSceneElementsIncludingDeleted().slice()
		const idx = elements.findIndex(e => e.id === element.id)
		if (idx === -1) {
			return
		}
		const current = elements[idx]
		elements[idx] = {
			...current,
			width: patch.width ?? current.width,
			height: patch.height ?? current.height,
			customData: {
				...current.customData,
				html: patch.html ?? current.customData?.html,
				color: patch.color ?? current.customData?.color,
			},
		}
		excalidrawAPI.updateScene({ elements })
	}, [excalidrawAPI, element.id])

	const onInput = useCallback(() => {
		if (saveTimeoutRef.current) {
			clearTimeout(saveTimeoutRef.current)
		}
		saveTimeoutRef.current = setTimeout(() => {
			persist({ html: textRef.current?.innerHTML || '' })
		}, 400)
	}, [persist])

	const setColor = useCallback((c: string) => {
		persist({ color: c })
	}, [persist])

	const setSize = useCallback((key: 's' | 'm' | 'l') => {
		const s = NOTE_SIZES[key]
		persist({ width: s.w, height: s.h })
	}, [persist])

	const onSelectionChange = useCallback(() => {
		const sel = window.getSelection()
		if (!sel || sel.isCollapsed || !sel.rangeCount || !textRef.current) {
			setSelToolbar(null)
			return
		}
		const anchor = sel.anchorNode
		const host = anchor && (anchor.nodeType === 3 ? anchor.parentElement : anchor as HTMLElement)
		if (!host || !textRef.current.contains(host)) {
			setSelToolbar(null)
			return
		}
		const rect = sel.getRangeAt(0).getBoundingClientRect()
		if (rect.width === 0 && rect.height === 0) {
			setSelToolbar(null)
			return
		}
		savedRangeRef.current = sel.getRangeAt(0).cloneRange()
		// Coordonnées VIEWPORT (pas relatives à la note) : la barre est
		// téléportée via createPortal (voir findPortalTarget, rendu plus bas),
		// donc position:'fixed' + coordonnées écran directes.
		setSelToolbar({ top: rect.top - 40, left: rect.left + rect.width / 2 })
	}, [])

	useEffect(() => {
		document.addEventListener('selectionchange', onSelectionChange)
		return () => document.removeEventListener('selectionchange', onSelectionChange)
	}, [onSelectionChange])

	// N'utilise PAS document.execCommand : Excalidraw a son propre gestionnaire
	// pointerdown global (capture, sur document) qui reprend le focus/la
	// sélection AVANT que le clic sur un bouton de la barre n'atteigne notre
	// contenteditable — même avec preventDefault sur notre propre handler
	// (un listener local ne peut pas devancer un listener en phase de capture
	// posé plus haut dans l'arbre). execCommand dépend du focus courant, donc
	// il échoue silencieusement dans ce contexte. À la place : manipulation
	// DOM directe sur l'objet Range sauvegardé (savedRangeRef), indépendante
	// du focus/de la sélection au moment du clic.
	const applyFormat = useCallback((cmd: 'bold' | 'underline' | 'big' | string) => {
		const range = savedRangeRef.current
		if (!range) {
			return
		}

		const wrapper = document.createElement(cmd === 'bold' ? 'b' : cmd === 'underline' ? 'u' : 'span')
		if (cmd === 'big') {
			wrapper.style.fontSize = '1.35em'
		} else if (cmd !== 'bold' && cmd !== 'underline') {
			wrapper.style.color = cmd
		}

		try {
			range.surroundContents(wrapper)
		} catch {
			// La sélection traverse plusieurs éléments (surroundContents ne
			// gère qu'un sous-arbre unique) — repli : extraire puis réinsérer.
			const contents = range.extractContents()
			wrapper.appendChild(contents)
			range.insertNode(wrapper)
		}

		setSelToolbar(null)
		onInput()
	}, [onInput])

	return (
		<div
			ref={noteRef}
			className="whiteboard-rich-note"
			style={{
				position: 'relative',
				boxSizing: 'border-box',
				width: '100%',
				height: '100%',
				background: NOTE_COLORS[color] || NOTE_COLORS.canary,
				border: '1.5px solid rgba(30,30,30,0.75)',
				borderRadius: '8px',
				boxShadow: '0 3px 8px -3px rgba(38,35,25,0.3)',
				padding: '12px',
				fontFamily: 'var(--ui-font-family, sans-serif)',
				overflow: 'hidden',
			}}
			onFocus={() => {
				setShowTools(true)
				const r = noteRef.current?.getBoundingClientRect()
				if (r) {
					setToolsPos({ top: r.top - 46, left: r.left + r.width / 2 })
				}
			}}
			onBlur={(e) => {
				if (!e.currentTarget.contains(e.relatedTarget as Node)) {
					setShowTools(false)
					setSelToolbar(null)
				}
			}}
		>
			<EditableSurface textRef={textRef} onInput={onInput} />

			{selToolbar && createPortal(
				<div
					style={{
						position: 'fixed', top: selToolbar.top, left: selToolbar.left, transform: 'translateX(-50%)',
						display: 'flex', gap: '3px', background: '#26231a', borderRadius: '9px', padding: '5px',
						boxShadow: '0 10px 24px -8px rgba(0,0,0,0.4)', zIndex: 9999,
					}}
					onMouseDown={(e) => e.preventDefault()}
				>
					<button type="button" onClick={() => applyFormat('big')} style={selBtnStyle} title={t('whiteboard', 'Bigger')}>A+</button>
					<button type="button" onClick={() => applyFormat('underline')} style={selBtnStyle} title={t('whiteboard', 'Underline')}><u>S</u></button>
					<button type="button" onClick={() => applyFormat('bold')} style={{ ...selBtnStyle, fontWeight: 700 }} title={t('whiteboard', 'Bold')}>G</button>
					{['#e94057', '#2e86de', '#10ac84'].map(c => (
						<button key={c} type="button" onClick={() => applyFormat(c)}
							style={{ width: 16, height: 16, borderRadius: '50%', background: c, border: '1.5px solid rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0 }} />
					))}
				</div>,
				portalTarget,
			)}

			{showTools && !selToolbar && toolsPos && createPortal(
				<div
					style={{
						position: 'fixed', top: toolsPos.top, left: toolsPos.left, transform: 'translateX(-50%)',
						display: 'flex', flexDirection: 'column', gap: '6px', background: '#fbf9f4',
						border: '1px solid #d9cfba', borderRadius: '10px', padding: '7px 8px',
						boxShadow: '0 8px 20px -10px rgba(38,35,25,0.35)', zIndex: 9999,
					}}
					onMouseDown={(e) => e.preventDefault()}
				>
					<div style={{ display: 'flex', gap: '4px' }}>
						{(['s', 'm', 'l'] as const).map(k => (
							<button key={k} type="button" onClick={() => setSize(k)}
								style={{ flex: 1, height: 20, borderRadius: 6, border: '1px solid #d9cfba', background: '#f1ece4', fontSize: 10, cursor: 'pointer' }}>
								{k.toUpperCase()}
							</button>
						))}
					</div>
					<div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px' }}>
						{Object.entries(NOTE_COLORS).map(([key, hex]) => (
							<button key={key} type="button" onClick={() => setColor(key)}
								style={{
									width: 15, height: 15, borderRadius: 4, background: hex, cursor: 'pointer', padding: 0,
									border: key === color ? '2px solid #0C6CA8' : '1px solid rgba(0,0,0,0.15)',
								}} />
						))}
					</div>
				</div>,
				portalTarget,
			)}
		</div>
	)
}

const selBtnStyle: React.CSSProperties = {
	width: 24, height: 24, border: 'none', borderRadius: 6, background: 'none',
	color: '#f1ece4', cursor: 'pointer', fontSize: 12, fontFamily: 'inherit',
}
