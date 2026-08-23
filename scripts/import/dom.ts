const ELEMENT_NODE = 1

export function childElements(el: Element): Element[] {
  const out: Element[] = []
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i]!
    if (node.nodeType === ELEMENT_NODE) out.push(node as Element)
  }
  return out
}

export function firstChildNamed(el: Element, name: string): Element | null {
  return childElements(el).find(child => child.nodeName === name) ?? null
}

export function textOf(el: Element, childName: string): string | null {
  const child = firstChildNamed(el, childName)
  return child ? (child.textContent ?? '').trim() : null
}

/**
 * MuseScore encodes some characters as SMuFL symbols rather than text — the
 * subscript in "CDEGA C₁" arrives as <sym>tuplet1</sym>. Unknown symbols throw
 * rather than being silently dropped from a title.
 */
const SYMBOL_TEXT: Record<string, string> = {
  tuplet0: '₀', tuplet1: '₁', tuplet2: '₂', tuplet3: '₃', tuplet4: '₄',
  tuplet5: '₅', tuplet6: '₆', tuplet7: '₇', tuplet8: '₈', tuplet9: '₉',
}

/** Flattens a MuseScore <text> element, resolving <sym> children. */
export function frameText(textEl: Element): string {
  let out = ''
  for (let i = 0; i < textEl.childNodes.length; i++) {
    const node = textEl.childNodes[i]!
    if (node.nodeType === ELEMENT_NODE) {
      const child = node as Element
      if (child.nodeName === 'sym') {
        const name = (child.textContent ?? '').trim()
        const replacement = SYMBOL_TEXT[name]
        if (replacement === undefined) {
          throw new Error(`Unhandled MuseScore symbol <sym>${name}</sym> in a text frame`)
        }
        out += replacement
      } else {
        // <font> and similar carry no text of their own in this corpus.
        out += child.textContent ?? ''
      }
    } else {
      out += node.nodeValue ?? ''
    }
  }
  return out.trim()
}
