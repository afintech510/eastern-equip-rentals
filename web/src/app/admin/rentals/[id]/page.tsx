import RentalPOS from '@/components/admin/RentalPOS';

export const metadata = { title: 'Admin · Handover — Eastern Rentals' };

export default function AdminRentalDetailPage({ params }: { params: { id: string } }) {
  return <RentalPOS rentalId={params.id} />;
}
