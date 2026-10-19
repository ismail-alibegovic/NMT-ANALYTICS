import { afterEach,expect,it } from 'vitest';
import { cleanup,screen } from '@testing-library/react';
import { render } from './renderWithI18n';
import RevenueChart from '../components/analytics/RevenueChart';
import { en } from '../lib/i18n/en'; import { bs } from '../lib/i18n/bs';
afterEach(()=>{cleanup();localStorage.clear();});
for(const [lang,c] of [['en',en],['bs',bs]] as const)it(`renders chart labels and empty state in ${lang}`,()=>{
 localStorage.setItem('travline_lang',lang);const view=render(<RevenueChart data={[{date:'2041-04-23',total_amount_sum:180,total_paid_sum:60}]} currency="BAM"/>);
 expect(screen.getByText(c.reports.totalRevenue)).toBeInTheDocument();expect(screen.getByText(c.reports.totalPaid)).toBeInTheDocument();
 view.rerender(<RevenueChart data={[]}/>);expect(screen.getByText(c.reports.noData)).toBeInTheDocument();
});
