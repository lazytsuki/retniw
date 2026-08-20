import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type EntryContentProps = {
  content: string
  markdown?: boolean
}

export function EntryContent({ content, markdown = false }: EntryContentProps) {
  if (!markdown) {
    return <p className="entry-content entry-content--plain">{content}</p>
  }

  return (
    <div className="entry-content entry-content--markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} rel="noreferrer" target="_blank">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
