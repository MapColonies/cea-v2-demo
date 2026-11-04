import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,it,expect,vi} from 'vitest';
import {ModelsList} from './ModelsList';
import type {Model} from '@/lib/cea/rules';
vi.mock('./ModelThumbnail',()=>({ModelThumbnail:()=>null}));
afterEach(cleanup);
it('each catalog status includes only its exact approval state',()=>{
 const models=['full','partial','zero','rejected'].map(id=>({id,name:id,country:'ישראל',is_rejected:id==='rejected'} as Model));
 render(<ModelsList models={models} selectedModel={null} onSelectModel={vi.fn()} subtileStats={{full:{total:2,approved:2},partial:{total:2,approved:1},zero:{total:2,approved:0},rejected:{total:2,approved:0}}}/>);
 fireEvent.click(screen.getByRole('button',{name:/ישראל/}));
 for(const [label,id] of [['מאושר','full'],['מאושר חלקית','partial'],['לא נבדק','zero'],['לא מאושר','rejected']]){fireEvent.click(screen.getByRole('button',{name:new RegExp(`^${label}$`)}));expect(screen.getByText(id,{exact:true})).toBeInTheDocument();for(const other of models.filter(m=>m.id!==id))expect(screen.queryByText(other.name,{exact:true})).not.toBeInTheDocument();}
});