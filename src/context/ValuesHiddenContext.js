import { createContext } from 'react'

// Shared visibility flag for monetary values on the Financeiro tab.
// Default false so components used elsewhere (e.g. the Trabalhos list) are unaffected —
// only Financeiro provides `true` when the user toggles values off.
export const ValuesHiddenContext = createContext(false)

export const MONEY_MASK = '€•••'
