import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { CornerDownRight, MessageCircle, Send, Trash } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, errorMessage } from '../../lib/api'
import { cn } from '../../lib/cn'
import { timeAgo } from '../../lib/format'
import { sk, useComments } from '../../lib/queries'
import { useUser } from '../../store/auth'
import { toast } from '../../store/toast'
import type { Comment } from '../../types'
import { UserChip } from '../collect/Collect'
import { Button } from '../ui/Button'
import { EmptyState, Skeleton } from '../ui/Feedback'

function Composer({
  onSubmit,
  placeholder,
  autoFocus,
  onCancel,
}: {
  onSubmit: (body: string) => Promise<void>
  placeholder: string
  autoFocus?: boolean
  onCancel?: () => void
}) {
  const [body, setBody] = useState('')
  const [pending, setPending] = useState(false)
  const submit = async () => {
    if (!body.trim()) return
    setPending(true)
    try {
      await onSubmit(body)
      setBody('')
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="rounded-2xl border border-line/10 bg-line/[0.03] p-2 focus-within:border-accent/40">
      <textarea
        value={body}
        autoFocus={autoFocus}
        onChange={(e) => setBody(e.target.value.slice(0, 2000))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void submit()
          if (e.key === 'Escape' && onCancel) onCancel()
        }}
        placeholder={placeholder}
        rows={body.split('\n').length > 2 ? 5 : 2}
        className="w-full resize-none bg-transparent px-2 py-1.5 text-[14.5px] leading-relaxed text-fg outline-none placeholder:text-faint"
      />
      <div className="flex items-center justify-end gap-2 px-1">
        <span className="mr-auto text-[11px] text-faint">{body.length > 1800 ? `${body.length} / 2000` : 'Ctrl + Enter — отправить'}</span>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        )}
        <Button size="sm" variant="primary" loading={pending} disabled={!body.trim()} onClick={submit} icon={<Send className="h-3.5 w-3.5" />}>
          Отправить
        </Button>
      </div>
    </div>
  )
}

function CommentItem({
  c,
  onReply,
  onDelete,
  canDelete,
  reply,
}: {
  c: Comment
  onReply: () => void
  onDelete: () => void
  canDelete: boolean
  reply?: boolean
}) {
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('group flex gap-3', reply && 'pl-2')}>
      <div className="min-w-0 flex-1">
        <UserChip user={c.author} size={reply ? 28 : 34} sub={<span className="block text-xs text-faint">{timeAgo(c.createdAt)}</span>} />
        <p className={cn('mt-2 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-fg-2', reply ? 'pl-[40px]' : 'pl-[46px]')}>{c.body}</p>
        <div className={cn('mt-1 flex gap-3 text-xs', reply ? 'pl-[40px]' : 'pl-[46px]')}>
          <button onClick={onReply} className="font-medium text-muted hover:text-accent">
            Ответить
          </button>
          {canDelete && (
            <button onClick={onDelete} className="flex items-center gap-1 text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100 focus:opacity-100">
              <Trash className="h-3 w-3" /> Удалить
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/** Обсуждение тайтла (chapterId = null) или главы. */
export function Comments({ novelId, chapterId = null, className }: { novelId: string; chapterId?: string | null; className?: string }) {
  const user = useUser()
  const qc = useQueryClient()
  const location = useLocation()
  const { data: comments = [], isLoading } = useComments(novelId, chapterId)
  const [replyTo, setReplyTo] = useState<string | null>(null)

  const threads = useMemo(() => {
    const roots = comments.filter((c) => !c.parentId)
    const replies = new Map<string, Comment[]>()
    for (const c of comments) if (c.parentId) replies.set(c.parentId, [...(replies.get(c.parentId) ?? []), c])
    return roots.map((r) => ({ root: r, replies: replies.get(r.id) ?? [] })).reverse()
  }, [comments])

  const key = sk.comments(novelId, chapterId)

  const add = async (body: string, parentId: string | null) => {
    try {
      const created = await api.addComment({ novelId, chapterId, parentId, body })
      qc.setQueryData<Comment[]>(key, (list) => [...(list ?? []), created])
      setReplyTo(null)
    } catch (e) {
      toast.error('Комментарий не отправлен', errorMessage(e))
      throw e
    }
  }

  const remove = async (c: Comment) => {
    try {
      await api.deleteComment(c.id)
      qc.setQueryData<Comment[]>(key, (list) => (list ?? []).filter((x) => x.id !== c.id && x.parentId !== c.id))
    } catch (e) {
      toast.error('Не удалось удалить', errorMessage(e))
    }
  }

  const canDelete = (c: Comment) => Boolean(user && (user.id === c.userId || user.role === 'admin'))

  return (
    <section className={className}>
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
        <MessageCircle className="h-5 w-5 text-accent" />
        {chapterId ? 'Комментарии к главе' : 'Обсуждение'}
        <span className="text-sm font-normal text-faint">{comments.length || ''}</span>
      </h3>

      <div className="mt-4">
        {user ? (
          <Composer placeholder={chapterId ? 'Что думаете об этой главе?' : 'Поделитесь впечатлениями — без спойлеров, пожалуйста'} onSubmit={(b) => add(b, null).catch(() => {})} />
        ) : (
          <p className="rounded-2xl border border-line/10 bg-line/[0.03] px-4 py-3 text-sm text-muted">
            <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="font-semibold text-accent hover:underline">
              Войдите
            </Link>
            , чтобы оставлять комментарии.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-6">
        {isLoading && Array.from({ length: 2 }, (_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        {!isLoading && !threads.length && (
          <EmptyState kanji="話" title="Пока тихо" description="Будьте первым, кто оставит комментарий." className="py-8" />
        )}
        <AnimatePresence initial={false}>
          {threads.map(({ root, replies }) => (
            <div key={root.id}>
              <CommentItem c={root} onReply={() => setReplyTo(root.id)} onDelete={() => remove(root)} canDelete={canDelete(root)} />
              {(replies.length > 0 || replyTo === root.id) && (
                <div className="ml-[17px] mt-3 space-y-4 border-l border-line/10 pl-4">
                  {replies.map((r) => (
                    <CommentItem key={r.id} c={r} reply onReply={() => setReplyTo(root.id)} onDelete={() => remove(r)} canDelete={canDelete(r)} />
                  ))}
                  {replyTo === root.id && user && (
                    <div className="flex gap-2">
                      <CornerDownRight className="mt-3 h-4 w-4 shrink-0 text-faint" />
                      <div className="flex-1">
                        <Composer
                          autoFocus
                          placeholder={`Ответ для ${root.author?.displayName ?? 'читателя'}`}
                          onCancel={() => setReplyTo(null)}
                          onSubmit={(b) => add(b, root.id).catch(() => {})}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </AnimatePresence>
      </div>
    </section>
  )
}
