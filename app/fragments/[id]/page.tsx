import { redirect } from 'next/navigation'

type FragmentDetailPageProps = { params: Promise<{ id: string }> }

export default async function FragmentDetailPage({ params }: FragmentDetailPageProps) {
  const { id } = await params
  redirect(`/thoughts/${id}`)
}
