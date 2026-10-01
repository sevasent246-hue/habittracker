export type Habit = {
  id: string
  title: string
  description: string
  color: string
  createdAt: { toMillis: () => number } | null
  updatedAt: { toMillis: () => number } | null
  completedDates: string[]
}

export type HabitValues = Pick<Habit, 'title' | 'description' | 'color'>
