import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'

export function startTour(onDone: () => void, isAuth = false) {
  const authOnlySteps = isAuth ? [
    {
      element: '[data-tour="smart-practice-link"]',
      popover: {
        title: 'Smart Practice',
        description: 'Use Smart Practice to let the app pick a problem based on your weakest proficiency areas.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
    {
      element: '[data-tour="nav-stats"]',
      popover: {
        title: 'Your progress',
        description: 'The Stats page shows your proficiency score per topic and stage. Expand any topic card to see your score trend over the last 30 days.',
        side: 'bottom' as const,
        align: 'start' as const,
      },
    },
  ] : []

  const d = driver({
    showProgress: true,
    animate: true,
    overlayOpacity: 0.5,
    popoverClass: 'leetgame-tour',
    onDestroyStarted: () => {
      d.destroy()
      onDone()
    },
    steps: [
      {
        element: '[data-tour="problem-panel"]',
        popover: {
          title: 'Practice problem',
          description: 'Each session gives you a LeetCode-style problem. No code required — explain your approach in plain English.',
          side: 'right',
          align: 'start',
        },
      },
      {
        element: '[data-tour="chat-panel"]',
        popover: {
          title: 'Stage-by-stage guidance',
          description: 'The AI walks you through up to five stages: Edge Cases, Brute Force, Pattern, Algorithm, and Time & Space Complexity. You advance when you get it right.',
          side: 'left',
          align: 'start',
        },
      },
      {
        element: '[data-tour="nav-search"]',
        popover: {
          title: 'Search & filter',
          description: 'Browse problems by keyword, difficulty, and topic tags. Practice them as a sequential playlist.',
          side: 'bottom',
          align: 'start',
        },
      },
      ...authOnlySteps,
    ],
  })

  d.drive()
}
