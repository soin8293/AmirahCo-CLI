import React from 'react'
import { Box, Text, useAnimationFrame, useTheme } from '../../ink.js'
import { useSettings } from '../../hooks/useSettings.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { renderElricMatrix, selectElricMask } from './elricMatrix.js'

export function MatrixElric({ maxRows = Infinity }: { maxRows?: number }) {
  const { columns } = useTerminalSize()
  const [theme] = useTheme()
  const reduced = useSettings().prefersReducedMotion ?? false
  const [ref, time] = useAnimationFrame(reduced ? null : 180)
  const mask = selectElricMask(Math.max(0, columns - 2), maxRows)
  const frame = reduced ? 0 : Math.floor(time / 180)
  return <Box ref={ref} flexDirection="column" flexShrink={0}>
    <Text wrap="truncate-end">{mask ? renderElricMatrix(mask, frame, theme.startsWith('light')) : 'Elric'}</Text>
  </Box>
}
