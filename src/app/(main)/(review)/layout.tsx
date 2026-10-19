import SubTabs from '@/components/SubTabs';

const TABS = [
  { href: '/history', label: 'Days' },
  { href: '/analytics', label: 'Stats' },
];

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SubTabs tabs={TABS} label="Review" />
      {children}
    </>
  );
}
