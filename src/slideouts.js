// Single global listener pattern -- replicates Going Yard's AtBatSlideIn/PitcherSlideIn
// mechanism exactly (PROMPT_SixPoints_PlayerTeamSlideouts.md §2/§8). There is ONE mounted
// PlayerSlideout and ONE TeamSlideout near the app root; any tab opens either by calling these
// functions, no prop-drilling and no per-tab slideout instances.
let PLAYER_SLIDE_LISTENER = null
let TEAM_SLIDE_LISTENER = null

export function openPlayerSlide(player) {
  closeTeamSlide() // z-index gotcha from the spec doc -- explicitly close the other panel
  if (PLAYER_SLIDE_LISTENER) PLAYER_SLIDE_LISTENER(player)
}

export function closePlayerSlide() {
  if (PLAYER_SLIDE_LISTENER) PLAYER_SLIDE_LISTENER(null)
}

export function subscribePlayerSlide(setter) {
  PLAYER_SLIDE_LISTENER = setter
  return () => {
    PLAYER_SLIDE_LISTENER = null
  }
}

export function openTeamSlide(team) {
  closePlayerSlide()
  if (TEAM_SLIDE_LISTENER) TEAM_SLIDE_LISTENER(team)
}

export function closeTeamSlide() {
  if (TEAM_SLIDE_LISTENER) TEAM_SLIDE_LISTENER(null)
}

export function subscribeTeamSlide(setter) {
  TEAM_SLIDE_LISTENER = setter
  return () => {
    TEAM_SLIDE_LISTENER = null
  }
}
