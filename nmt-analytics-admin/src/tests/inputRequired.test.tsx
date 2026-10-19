import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import Input from '../components/form/input/InputField';
test('shared Input participates in native required validation without requiring optional fields',()=>{
 const {rerender}=render(<form><label htmlFor="required-name">Name</label><Input id="required-name" required value="" onChange={()=>{}}/></form>);
 const input=screen.getByLabelText('Name') as HTMLInputElement;expect(input.validity.valueMissing).toBe(true);
 rerender(<form><label htmlFor="required-name">Name</label><Input id="required-name" value="" onChange={()=>{}}/></form>);expect(input.validity.valid).toBe(true);
});
