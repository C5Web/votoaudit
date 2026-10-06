import { adminHandle } from '@/lib/admin-guard'
import { runNotificationsSweep } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

/**
 * Dispara a varredura de notificações: gera lembretes pendentes e entrega a fila.
 * Protegido para administradores; pode ser acionado por tarefa agendada com credencial de admin.
 */
export async function POST() {
  return adminHandle(() => runNotificationsSweep(), 'ops.notifications.dispatch')
}
