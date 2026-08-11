import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductBrand } from './ProductBrand';

describe('ProductBrand', () => {
  it('uses the shared organization label while keeping the product distinct', () => {
    render(<ProductBrand product="STT" />);
    expect(screen.getByText('XGC2')).toBeInTheDocument();
    expect(screen.getByText('STT')).toBeInTheDocument();
  });
});
