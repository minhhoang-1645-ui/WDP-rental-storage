import { rows, text, type Row } from '@/operations/model';

export function publicCatalog(catalog: Row): Row {
  const fixtureImage = (image: string) => { try { return new URL(image).hostname.endsWith('.test'); } catch { return false; } };
  const products = rows(catalog.products).filter(product => !(/^(?:appointment|billing|settlement|contract|overdue|return|maintenance|manager|renew|test)-product-[0-9a-f]{8}$/i.test(text(product, 'id')) && fixtureImage(text(product, 'image'))));
  const sizes = rows(catalog.sizes).filter(size => products.some(product => product.sizeId === size.id)).map(size => {
    if (!fixtureImage(text(size, 'image'))) return size;
    const product = products.find(product => product.sizeId === size.id)!;
    return { ...size, image: product.image, dimensions: product.dimensions || size.dimensions, floorArea: product.floorArea || size.floorArea, volume: product.volume || size.volume };
  });
  return { ...catalog, products, sizes };
}
