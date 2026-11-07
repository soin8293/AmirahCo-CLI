import React from 'react'
import { Box, Text, useTheme } from '../../ink.js'
import { useTerminalSize } from '../../hooks/useTerminalSize.js'
import { MatrixElric } from './MatrixElric.js'

export function WelcomeV2() {
  const [theme] = useTheme()
  const light = theme.startsWith('light')
  const { rows } = useTerminalSize()

  return <Box flexDirection="column" flexShrink={0}>
    <Text color={light ? '#047857' : '#10b981'} bold>Welcome to AmirahCo CLI <Text dimColor>v{MACRO.DISPLAY_VERSION ?? MACRO.VERSION}</Text></Text>
    <MatrixElric maxRows={Math.max(6, rows - 26)} />
  </Box>
}
