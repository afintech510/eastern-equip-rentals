import ConfirmationClient from '@/components/reserve/ConfirmationClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Order Logged — Eastern Rentals' };

export default function ConfirmationPage({ params }: { params: { rentalId: string } }) {
  return <ConfirmationClient rentalId={params.rentalId} />;
}
