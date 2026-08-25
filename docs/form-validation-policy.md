# Form validation policy

Trad forms use one validation language everywhere: trading, account setup, settings, and administration.

## Required fields

- Every required control has a visible label and is marked `required` on `FormField`.
- An untouched empty control stays neutral. A muted, right-aligned `Required` cue appears inside the control.
- Required status must not use yellow, animation, or a warning treatment. Required is an instruction, not yet an error.
- Selects with a valid default do not need a cue. Optional controls are explicitly labeled `optional`.

## Errors

- A field becomes red only after the user leaves it or attempts to submit its form.
- Put a specific correction directly below the field, such as `Limit price is required` or `Leverage must be between 1 and 40`.
- Keep entered values intact after validation fails.
- Connect the control and message with `aria-invalid` and `aria-describedby`; never communicate an error by color alone.
- Server and exchange failures remain visible as form- or action-level messages. They do not masquerade as missing-field errors.

## Implementation

- Use `src/components/forms/FormField.vue` for labeled controls. It owns neutral required cues, interaction timing, error visibility, and ARIA wiring.
- Pass the complete field error to `error`; do not pre-style the input based on empty state.
- Use native `required`, `min`, `max`, and input types where they express the same rule as Trad validation.
- New one-off required/error CSS is not allowed. Extend the shared primitive when a genuinely new state is needed.

## Comboboxes

- Editable pickers retain a visible label and use the ARIA combobox/listbox pattern.
- Typing filters account- and network-appropriate options. Arrow keys move, Enter accepts, Escape closes, and Tab may accept the highlighted exact workflow before advancing.
- Pointer and touch selection are first-class.
- Catalog failure must not erase user input or prevent manual entry; the authoritative backend still validates the submitted symbol.
