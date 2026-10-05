import { memo, type ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { parseInline, type Block } from '../../lib/text'

export function renderInline(text: string): ReactNode {
  return parseInline(text).map((seg, i) =>
    seg.bold ? <strong key={i}>{seg.text}</strong> : seg.italic ? <em key={i}>{seg.text}</em> : <span key={i}>{seg.text}</span>
  )
}

interface Props {
  blocks: Block[]
  header?: ReactNode
  footer?: ReactNode
  activeIndex?: number | null
  className?: string
  /** Картинки грузятся сразу — в постраничном режиме от них зависит раскладка страниц */
  eager?: boolean
  onImageClick?: (src: string, alt: string) => void
}

/** Текст главы. У каждого блока есть data-block — по нему работают закладки и озвучка. */
export const ChapterContent = memo(function ChapterContent({ blocks, header, footer, activeIndex, className, eager, onImageClick }: Props) {
  let firstParagraph = true
  return (
    <div className={cn('reader-prose', className)} lang="ru">
      {header}
      {blocks.map((b, i) => {
        const prev = blocks[i - 1]
        const afterBreak = !prev || prev.type === 'break' || prev.type === 'h' || prev.type === 'img'
        switch (b.type) {
          case 'p': {
            const dropCap = firstParagraph && /^[\p{L}]/u.test(b.text) && b.text.length > 60
            firstParagraph = false
            return (
              <p
                key={i}
                data-block={i}
                className={cn(afterBreak && 'no-indent', dropCap && 'drop-cap', activeIndex === i && 'tts-active')}
              >
                {renderInline(b.text)}
              </p>
            )
          }
          case 'quote':
            return (
              <p key={i} data-block={i} className={cn('r-quote', activeIndex === i && 'tts-active')}>
                {renderInline(b.text)}
              </p>
            )
          case 'h':
            return (
              <h3 key={i} data-block={i} className={cn('r-h', activeIndex === i && 'tts-active')}>
                {renderInline(b.text)}
              </h3>
            )
          case 'break':
            return (
              <div key={i} className="r-break" aria-hidden>
                ✦
              </div>
            )
          case 'img':
            return (
              <figure key={i} data-block={i}>
                <img
                  src={b.src}
                  alt={b.alt}
                  loading={eager ? 'eager' : 'lazy'}
                  draggable={false}
                  className="cursor-zoom-in"
                  onClick={() => onImageClick?.(b.src, b.alt)}
                />
                {b.alt && <figcaption>{b.alt}</figcaption>}
              </figure>
            )
        }
      })}
      {footer}
    </div>
  )
})
