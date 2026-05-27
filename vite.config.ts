import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

function groqProxy(): Plugin {
  return {
    name: 'groq-proxy',
    configureServer(server) {
      server.middlewares.use('/api/transcribe', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method not allowed')
          return
        }

        const apiKey = process.env.GROQ_API_KEY
        if (!apiKey) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'GROQ_API_KEY not configured' }))
          return
        }

        try {
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(chunk as Buffer)
          }
          const body = Buffer.concat(chunks)

          const contentType = req.headers['content-type'] || ''

          const response = await fetch(
            'https://api.groq.com/openai/v1/audio/transcriptions',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': contentType,
              },
              body,
            }
          )

          const data = await response.text()
          res.statusCode = response.status
          res.setHeader('Content-Type', 'application/json')
          res.end(data)
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), groqProxy()],
})
