// Defaults for the reviewed Chase close form.
export const CLOSE_CHASE_BOUNDARY_BPS = '20'
export const CLOSE_CHASE_EXPIRY_MINUTES = '5'

// The one-tap Chase close has no boundary and no expiry: it follows the book
// until the close fills or the Chase is canceled.
export const CLOSE_CHASE_PRESET_LABEL = 'Chase until filled · post-only, follows the book'
