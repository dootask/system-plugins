import { createFileRoute } from '@tanstack/react-router'
import { AdminTabs } from '#/components/admin-tabs'
import { InstListView } from '#/components/views/inst-list'

export const Route = createFileRoute('/admin/insts')({
  component: () => (
    <>
      <AdminTabs />
      <InstListView box="admin" active />
    </>
  ),
})
