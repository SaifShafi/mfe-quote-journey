import { useId, type ReactNode } from 'react'

export interface PanelProps {
  heading: string
  /**
   * The shell owns <h1>. A remote cannot know how deep in the document it has
   * been mounted, so the level is the consumer's call and 2 is only a default.
   * Hard-coding <h2> here is how you get a heading-order violation that appears
   * solely in the composed page, which is the Stage 2 experiment.
   */
  headingLevel?: 2 | 3 | 4
  children: ReactNode
}

/**
 * A titled region. The heading names the region through aria-labelledby, so the
 * panel is reachable as a landmark and a screen reader user can tell which
 * remote's surface they have landed in.
 */
export function Panel({ heading, headingLevel = 2, children }: PanelProps) {
  const headingId = useId()
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4'

  return (
    <section className="sui-panel" aria-labelledby={headingId}>
      <Heading className="sui-panel__heading" id={headingId}>
        {heading}
      </Heading>
      {children}
    </section>
  )
}
