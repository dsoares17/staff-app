export default function EmptyState({ icon, headline, subtext, actions }) {
  return (
    <div className="flex flex-col items-center px-8 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#1A1A1A] text-[#444444]">
        {icon}
      </div>
      <h2 className="mb-2 text-base font-semibold text-fg">{headline}</h2>
      <p className="mb-6 text-sm leading-relaxed text-[#888888]">{subtext}</p>
      {actions ? <div className="flex w-full flex-col gap-3">{actions}</div> : null}
    </div>
  )
}
