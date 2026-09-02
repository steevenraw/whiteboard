/**
 * SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Panier A (chantier whiteboard, 01/09) : le vote, le minuteur, la présentation
 * et l'enregistrement existaient déjà mais uniquement dans le menu caché ☰
 * (voir ExcalidrawMenu.tsx). On les promeut ici en icônes visibles dans la
 * barre d'outils principale, sans les retirer du menu (les deux chemins
 * cohabitent, comme le raccourci clavier et le menu pour l'export).
 *
 * Panier B (01/09) : le post-it crée désormais un élément "embeddable" (pas
 * rectangle+texte) — seul moyen d'obtenir du texte riche (gras/souligné/
 * couleur sur sélection), impossible sur un élément texte natif Excalidraw
 * (voir RichStickyNote.tsx et la mémoire du chantier pour le détail/preuves).
 * Compromis accepté par le user : ce post-it n'apparaît pas dans l'export
 * image natif (limitation d'Excalidraw sur tout embeddable, pas spécifique
 * à ce patch).
 */
import { useCallback } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { mdiVote, mdiTimerOutline, mdiPresentationPlay, mdiRecordCircle, mdiNoteText } from '@mdi/js'
import { convertToExcalidrawElements, viewportCoordsToSceneCoords } from '@nextcloud/excalidraw'
import { t } from '@nextcloud/l10n'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types'
import { useExcalidrawStore } from '../stores/useExcalidrawStore'
import { renderToolbarButton } from '../components/ToolbarButton'
import { getViewportCenterPoint } from '../utils/positionElementsAtViewport'
import { NOTE_SIZES } from '../components/RichStickyNote'

const DEFAULT_SIZE = NOTE_SIZES.s

interface QuickToolsOptions {
	onToggleTimer: () => void
	startPresentation: () => void
	startRecording: () => void
}

export function useQuickTools({ onToggleTimer, startPresentation, startRecording }: QuickToolsOptions) {
	const { excalidrawAPI } = useExcalidrawStore(useShallow(state => ({
		excalidrawAPI: state.excalidrawAPI as (ExcalidrawImperativeAPI | null),
	})))

	const showVotings = useCallback(() => {
		excalidrawAPI?.toggleSidebar({ name: 'custom', tab: 'voting', force: true })
	}, [excalidrawAPI])

	const addStickyNote = useCallback(() => {
		if (!excalidrawAPI) {
			return
		}
		const center = getViewportCenterPoint()
		const sceneCoords = viewportCoordsToSceneCoords(center, excalidrawAPI.getAppState())

		// convertToExcalidrawElements ne semble pas initialiser complètement
		// le type "embeddable" (crash "Cannot read properties of undefined
		// (reading 'length')" constaté en test, y compris avec `link` fourni
		// — non documenté dans les exemples officiels, contrairement à
		// rectangle/ellipse/texte). Contournement : on convertit un
		// RECTANGLE (tous les champs de base garantis correctement
		// initialisés), puis on bascule son `type` après coup — même
		// technique que pour customData ci-dessous (perdu par le
		// convertisseur, bug excalidraw/excalidraw#7654, réécrit après coup).
		// Fond et contour transparents : sans ça, Excalidraw dessine encore le
		// rectangle d'origine (nativement, sur le canevas) SOUS notre rendu
		// DOM (RichStickyNote) — double affichage constaté par le user
		// (bordure de couleur superflue autour de la note). Un seul rendu
		// visible doit rester : le nôtre.
		const newElements = convertToExcalidrawElements([{
			type: 'rectangle',
			x: sceneCoords.x - DEFAULT_SIZE.w / 2,
			y: sceneCoords.y - DEFAULT_SIZE.h / 2,
			width: DEFAULT_SIZE.w,
			height: DEFAULT_SIZE.h,
			backgroundColor: 'transparent',
			strokeColor: 'transparent',
			strokeWidth: 0,
		}])

		const note = {
			...newElements[0],
			type: 'embeddable' as const,
			// `link` RESTAURÉ après test : sans lui, Excalidraw n'appelle même
			// pas renderEmbeddable et affiche son propre placeholder générique
			// "Empty Web-Embed" — confirmé en direct. Le crash initial, lui,
			// venait bien de la conversion (rectangle ci-dessus), pas de
			// l'absence de link — mais link reste nécessaire pour une autre
			// raison. L'infobulle de lien affichée au clic est un coût
			// résiduel accepté de ce contournement.
			link: 'whiteboard-note://rich-sticky',
			customData: {
				whiteboardNoteType: 'rich-sticky',
				html: t('whiteboard', 'New idea'),
				color: 'canary',
			},
		}

		const elements = excalidrawAPI.getSceneElementsIncludingDeleted().slice()
		elements.push(note)

		excalidrawAPI.updateScene({
			elements,
			appState: {
				...excalidrawAPI.getAppState(),
				selectedElementIds: { [note.id]: true },
			},
		})
	}, [excalidrawAPI])

	const renderQuickTools = useCallback(() => {
		renderToolbarButton({
			class: 'quick-stickynote-container',
			icon: mdiNoteText,
			label: t('whiteboard', 'Sticky note'),
			onClick: addStickyNote,
		})
		renderToolbarButton({
			class: 'quick-vote-container',
			icon: mdiVote,
			label: t('whiteboard', 'Votings'),
			onClick: showVotings,
		})
		renderToolbarButton({
			class: 'quick-timer-container',
			icon: mdiTimerOutline,
			label: t('whiteboard', 'Show timer'),
			onClick: onToggleTimer,
		})
		renderToolbarButton({
			class: 'quick-presentation-container',
			icon: mdiPresentationPlay,
			label: t('whiteboard', 'Start presentation'),
			onClick: startPresentation,
		})
		renderToolbarButton({
			class: 'quick-recording-container',
			icon: mdiRecordCircle,
			label: t('whiteboard', 'Start recording'),
			onClick: startRecording,
		})
	}, [addStickyNote, showVotings, onToggleTimer, startPresentation, startRecording])

	return { renderQuickTools }
}
