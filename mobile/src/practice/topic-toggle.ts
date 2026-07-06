export function toggleTopic(activeTopics: string[], name: string): string[] {
  const next = activeTopics.includes(name)
    ? activeTopics.filter((t) => t !== name)
    : [...activeTopics, name]
  return next.length > 0 ? next : activeTopics
}
