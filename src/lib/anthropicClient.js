async function readErrorMessage(response) {
  const text = await response.text()

  try {
    const body = JSON.parse(text)
    return body?.error?.message || 'Pedido à IA falhou.'
  } catch {
    return text || 'Pedido à IA falhou.'
  }
}

async function readAnthropicSseStream(response) {
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Pedido à IA falhou.')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let assembledText = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue

      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue

      let event
      try {
        event = JSON.parse(data)
      } catch {
        continue
      }

      if (event.type === 'error') {
        throw new Error(event.error?.message || 'Pedido à IA falhou.')
      }

      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
        assembledText += event.delta.text ?? ''
      }
    }
  }

  return assembledText
}

/**
 * Calls the Anthropic API via the app proxy with streaming enabled.
 * Reassembles streamed text deltas and returns the complete assistant text.
 *
 * @param {object} requestBody Anthropic messages request body (without `stream`)
 * @returns {Promise<string>} Complete assistant text response
 */
export async function callAnthropic(requestBody) {
  const response = await fetch('/api/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      ...requestBody,
      stream: true,
    }),
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  return readAnthropicSseStream(response)
}
