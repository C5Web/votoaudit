import { AlertCircle } from 'lucide-react'

export function StatusMessage({ title = 'Não foi possível carregar os dados', text = 'Tente novamente em alguns instantes.' }: { title?: string; text?: string }) {
  return (
    <div className="mx-auto my-16 flex max-w-md flex-col items-center gap-3 rounded-lg bg-card p-8 text-center shadow-sm">
      <AlertCircle className="h-8 w-8 text-divergence" />
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}
