import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { api, ApiError } from '#/lib/api'
import { FormRenderer } from '#/components/form/FormRenderer'
import { initialFormValue, validateForm } from '#/lib/form'
import { Button } from '#/components/ui/button'
import { BackLink, ErrorBar, Loading } from '#/components/ui/misc'
import type { FormErrors, FormSchema } from '#/lib/form/types'

interface DefDetail {
  id: number
  name: string
  icon: string | null
  form_schema: FormSchema
}

export function StartForm({
  defId,
  backTo,
}: {
  defId: number
  backTo?: string
}) {
  const navigate = useNavigate()
  const back = backTo || '/'
  const [detail, setDetail] = useState<DefDetail | null>(null)
  const [value, setValue] = useState<Record<string, unknown>>({})
  const [errors, setErrors] = useState<FormErrors>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    api<DefDetail>(`/defs/${defId}`)
      .then((d) => {
        setDetail(d)
        setValue(initialFormValue(d.form_schema))
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : '加载模板详情失败'),
      )
      .finally(() => setLoading(false))
  }, [defId])

  async function submit() {
    if (!detail) return
    const { valid, errors: errs } = validateForm(detail.form_schema, value)
    if (!valid) {
      setErrors(errs)
      return
    }
    setErrors({})
    setSubmitting(true)
    setError(null)
    try {
      const res = await api<{ id: number }>('/insts', {
        method: 'POST',
        json: { defId: detail.id, formData: value },
      })
      navigate({
        to: '/insts/$id',
        params: { id: String(res.id) },
        search: { from: '/mine' },
      })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : '提交失败')
      setSubmitting(false)
    }
  }

  if (loading) return <Loading center />

  return (
    <div className="space-y-6">
      <BackLink to={back} />
      <h1 className="flex items-center gap-2 text-lg font-semibold">
        {detail ? (
          <>
            {detail.icon ? <span>{detail.icon}</span> : null}
            {detail.name}
          </>
        ) : (
          '发起申请'
        )}
      </h1>
      {error ? <ErrorBar message={error} /> : null}

      {detail ? (
        <div className="space-y-5">
          <FormRenderer
            schema={detail.form_schema}
            value={value}
            onChange={setValue}
            errors={errors}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => navigate({ to: back })}
              disabled={submitting}
            >
              取消
            </Button>
            <Button onClick={submit} disabled={submitting}>
              {submitting ? '提交中…' : '提交'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
