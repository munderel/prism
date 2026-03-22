'use client';

import { useEffect } from 'react';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';

interface OnboardingTourProps {
  onComplete: () => void;
}

export function OnboardingTour({ onComplete }: OnboardingTourProps) {
  useEffect(() => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayColor: 'rgba(0, 0, 0, 0.7)',
      steps: [
        {
          element: 'nav',
          popover: {
            title: 'Sidebar Navigation',
            description: 'Access all features from the sidebar — dashboard, goals, tasks, calendar, and more.',
            side: 'right',
          },
        },
        {
          element: '[href="/"]',
          popover: {
            title: 'Dashboard',
            description: "Your daily command center. See today's tasks, stats, and quick actions.",
            side: 'right',
          },
        },
        {
          element: '[href="/goals"]',
          popover: {
            title: 'Goal Stack',
            description: 'Build your goal hierarchy — from your High Hard Goal down to daily actions.',
            side: 'right',
          },
        },
        {
          element: '[href="/tasks"]',
          popover: {
            title: 'Tasks',
            description: 'Three types: Goal Stack, React (emergencies), and Maintenance (recurring).',
            side: 'right',
          },
        },
        {
          element: '[href="/powerdown"]',
          popover: {
            title: 'Power Down Ritual',
            description: 'End each day intentionally — review, plan tomorrow, and power down.',
            side: 'right',
          },
        },
        {
          element: '[href="/calendar"]',
          popover: {
            title: 'Calendar',
            description: 'View tasks, reviews, and Google Calendar events in one place.',
            side: 'right',
          },
        },
        {
          element: '[href="/settings"]',
          popover: {
            title: 'Settings',
            description: 'Set your MTP (Massively Transformative Purpose), timezone, and notification preferences.',
            side: 'right',
          },
        },
      ],
      onDestroyStarted: () => {
        driverObj.destroy();
        onComplete();
      },
    });

    driverObj.drive();

    return () => {
      driverObj.destroy();
    };
  }, [onComplete]);

  return null;
}
