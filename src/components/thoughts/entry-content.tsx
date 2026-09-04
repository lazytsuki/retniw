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
          table: ({ children, ...props }) => (
            <div
              className="entry-table-scroll"
              role="region"
              aria-label="表格，可横向滚动查看完整内容"
              tabIndex={0}
            >
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  )
}
