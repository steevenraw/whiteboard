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
 * On ajoute aussi un outil "Post-it" en un clic : crée directement un
 * rectangle + texte lié (pattern déjà utilisé par convertToExcalidrawElements)
 * au centre de la vue, sélectionné pour que le panneau de propriétés natif
 * d'Excalidraw (couleur, taille) s'ouvre immédiatement — évite le
 * dessiner-puis-taper-puis-colorer en plusieurs étapes.
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

const STICKY_WIDTH = 190
const STICKY_HEIGHT = 136

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

		const newElements = convertToExcalidrawElements([{
			type: 'rectangle',
			x: sceneCoords.x - STICKY_WIDTH / 2,
			y: sceneCoords.y - STICKY_HEIGHT / 2,
			width: STICKY_WIDTH,
			height: STICKY_HEIGHT,
			backgroundColor: '#ffec99',
			strokeColor: '#1e1e1e',
			fillStyle: 'solid',
			roundness: { type: 3 },
			label: {
				text: t('whiteboard', 'New idea'),
				fontSize: 20,
			},
		}])

		const elements = excalidrawAPI.getSceneElementsIncludingDeleted().slice()
		elements.push(...newElements)

		excalidrawAPI.updateScene({
			elements,
			appState: {
				...excalidrawAPI.getAppState(),
				selectedElementIds: { [newElements[0].id]: true },
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
