import AddIcon from '@mui/icons-material/Add'
import { Box, Button, Card, CardContent, Chip, CssBaseline, Stack, Typography } from '@mui/material'
import React from 'react'

function App() {
  const [count, setCount] = React.useState(0)

  return (
    <React.Fragment>
      <CssBaseline />
      <Box
        sx={{
          background: 'linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)',
          minHeight: '100vh',
          py: 6,
        }}
      >
        <Box sx={{ margin: '0 auto', maxWidth: 840, px: 3 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Chip color="primary" label="catalog:material-ui" />
            <Chip label="vite" variant="outlined" />
          </Stack>

          <Typography component="h1" sx={{ fontSize: '2.5rem', fontWeight: 700, mb: 1 }}>
            Material UI Example
          </Typography>
          <Typography color="text.secondary" sx={{ maxWidth: 640, mb: 4 }}>
            This app demonstrates how a catalog-specific frontend package can still share
            workspace-wide update automation.
          </Typography>

          <Card elevation={0} sx={{ borderRadius: 4, border: '1px solid', borderColor: 'divider' }}>
            <CardContent sx={{ p: 4 }}>
              <Stack spacing={2}>
                <Typography variant="h5">Dependency smoke check</Typography>
                <Typography color="text.secondary">
                  If this page builds, the Material UI catalog entries resolve correctly in the
                  example workspace.
                </Typography>
                <Button
                  onClick={() => setCount((value) => value + 1)}
                  startIcon={<AddIcon />}
                  sx={{ alignSelf: 'flex-start' }}
                  variant="contained"
                >
                  Increment demo counter
                </Button>
                <Typography variant="body2">Button clicks: {count}</Typography>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Box>
    </React.Fragment>
  )
}

export default App
