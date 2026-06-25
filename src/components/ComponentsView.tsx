// Secondary interfaces (SCAFFOLD). Direct inspection/editing of the underlying
// content components (tasks, goals, knowledge, events). Explicitly LOWER
// priority than the board — the design says most interaction happens via
// bubbles. This is a single placeholder; split into real views as needed.

export function ComponentsView() {
  return (
    <main className="board">
      <div className="empty">
        <p>Library (secondary interface).</p>
        {/* TODO: tabs or sections for Tasks, Goals, Knowledge, Events with
            list + create/edit/delete. Tasks: category, due-or-priority,
            recurrence. Goals: act-on + priority. Knowledge: category + body.
            Events: app vs google, push-to-calendar. */}
      </div>
    </main>
  );
}
