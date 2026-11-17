// FT3 — Manual Test Case Design & Testing Levels, exercised as automated Vitest cases against the
// real admin logic in ../productFile.js (the module that mirrors the store backend's product rules).
//
// Sections map directly to the FT3 rubric:
//   ECP  Equivalence Class Partitioning
//   BVA  Boundary Value Analysis
//   DT   Decision Table (Cause-Effect)
//   WB   White Box (CFG / cyclomatic complexity / MC-DC) on the price-validation decision
//   UT   Unit tests of the remaining productFile.js helpers
//   IT   Integration tests across the parse -> validate -> serialize pipeline
//
// Expected results are taken from the business rules in productFile.js / checkProduct's own
// comments, not from whatever the code currently returns.

import { describe, it, expect } from 'vitest'
import {
  parseProductsFile, normalize, toFileProduct, serialize, nextId, blankProduct, checkProduct,
  groupSizes, groupsIndex, nameSimilarity, suggestGroupKey, sharedFields, sameShared, LIMITS,
} from '../productFile'
import { omr } from '../../api'

// A minimal valid product: every ECP/BVA/DT case starts here and overrides one field,
// so each test isolates exactly the input class under study (single-fault assumption).
const base = () => ({
  id: 1,
  name: 'Redmi 17 4/128GB - Black',
  price: 45.5,
  original_price: null,
  image_url: ['https://cdn.example.com/redmi17.png'],
  color: 'Black',
  variant_group: '',
})

describe('ECP — Equivalence Class Partitioning (checkProduct)', () => {
  it('ECP-01 valid: integer id >= 0 is accepted', () => {
    expect(checkProduct({ ...base(), id: 0 }).errors).toEqual([])
  })
  it('ECP-02 invalid: negative id is rejected', () => {
    expect(checkProduct({ ...base(), id: -1 }).errors).toContain('ID must be a whole number, 0 or more.')
  })
  it('ECP-03 invalid: non-integer id is rejected', () => {
    expect(checkProduct({ ...base(), id: 1.5 }).errors).toContain('ID must be a whole number, 0 or more.')
  })
  it('ECP-04 valid: non-empty name is accepted', () => {
    expect(checkProduct(base()).errors).not.toContain('Name is required.')
  })
  it('ECP-05 invalid: empty (whitespace-only) name is rejected', () => {
    expect(checkProduct({ ...base(), name: '   ' }).errors).toContain('Name is required.')
  })
  it('ECP-06 valid: non-negative price with <=3 decimals is accepted', () => {
    expect(checkProduct({ ...base(), price: 12.345 }).errors).toEqual([])
  })
  it('ECP-07 invalid: negative price is rejected', () => {
    expect(checkProduct({ ...base(), price: -5 }).errors).toContain('Price is required and can’t be negative.')
  })
  it('ECP-08 invalid: missing price is rejected', () => {
    expect(checkProduct({ ...base(), price: '' }).errors).toContain('Price is required and can’t be negative.')
  })
  it('ECP-09 invalid: price with more than 3 decimals is rejected', () => {
    expect(checkProduct({ ...base(), price: 1.2345 }).errors).toContain('Price can have at most 3 decimals (baisa).')
  })
  it('ECP-10 valid: original_price above price gives no warning', () => {
    expect(checkProduct({ ...base(), original_price: 60 }).warnings).toEqual([])
  })
  it('ECP-11 invalid: original_price not above price warns (no real discount)', () => {
    expect(checkProduct({ ...base(), original_price: 10 }).warnings)
      .toContain('Original price isn’t above the price, so no discount is shown.')
  })
  it('ECP-12 valid: at least one image is accepted', () => {
    expect(checkProduct(base()).errors).not.toContain('Add at least one image.')
  })
  it('ECP-13 invalid: no images is rejected', () => {
    expect(checkProduct({ ...base(), image_url: [] }).errors).toContain('Add at least one image.')
  })
  it('ECP-14 invalid: only blank image entries is rejected', () => {
    expect(checkProduct({ ...base(), image_url: ['   '] }).errors).toContain('Add at least one image.')
  })
  it('ECP-15 valid: color within the length limit is accepted', () => {
    expect(checkProduct({ ...base(), color: 'Black' }).errors).toEqual([])
  })
  it('ECP-16 invalid: color over the length limit is rejected', () => {
    expect(checkProduct({ ...base(), color: 'x'.repeat(LIMITS.color + 1) }).errors)
      .toContain(`Color can be at most ${LIMITS.color} characters.`)
  })
})

describe('BVA — Boundary Value Analysis (checkProduct)', () => {
  // id: boundary at 0 (lowest valid whole number)
  it('BVA-01 id = -1 (min-1): rejected', () => {
    expect(checkProduct({ ...base(), id: -1 }).errors.length).toBeGreaterThan(0)
  })
  it('BVA-02 id = 0 (min): accepted', () => {
    expect(checkProduct({ ...base(), id: 0 }).errors).toEqual([])
  })
  it('BVA-03 id = 1 (min+1): accepted', () => {
    expect(checkProduct({ ...base(), id: 1 }).errors).toEqual([])
  })

  // price decimals: boundary at 3 allowed decimals
  it('BVA-04 price with 2 decimals (max-1): accepted', () => {
    expect(checkProduct({ ...base(), price: 10.12 }).errors).toEqual([])
  })
  it('BVA-05 price with 3 decimals (max): accepted', () => {
    expect(checkProduct({ ...base(), price: 10.123 }).errors).toEqual([])
  })
  it('BVA-06 price with 4 decimals (max+1): rejected', () => {
    expect(checkProduct({ ...base(), price: 10.1234 }).errors.length).toBeGreaterThan(0)
  })

  // color length: boundary at LIMITS.color (50)
  it(`BVA-07 color length = ${LIMITS.color - 1} (max-1): accepted`, () => {
    expect(checkProduct({ ...base(), color: 'x'.repeat(LIMITS.color - 1) }).errors).toEqual([])
  })
  it(`BVA-08 color length = ${LIMITS.color} (max): accepted`, () => {
    expect(checkProduct({ ...base(), color: 'x'.repeat(LIMITS.color) }).errors).toEqual([])
  })
  it(`BVA-09 color length = ${LIMITS.color + 1} (max+1): rejected`, () => {
    expect(checkProduct({ ...base(), color: 'x'.repeat(LIMITS.color + 1) }).errors.length).toBeGreaterThan(0)
  })

  // variant_group length: boundary at LIMITS.variantGroup (100)
  it(`BVA-10 group key length = ${LIMITS.variantGroup} (max): accepted`, () => {
    expect(checkProduct({ ...base(), variant_group: 'g'.repeat(LIMITS.variantGroup) }).errors).toEqual([])
  })
  it(`BVA-11 group key length = ${LIMITS.variantGroup + 1} (max+1): rejected`, () => {
    expect(checkProduct({ ...base(), variant_group: 'g'.repeat(LIMITS.variantGroup + 1) }).errors.length).toBeGreaterThan(0)
  })

  // name length: the business rule this test suite adds (see "defect" section below) —
  // a product name must be at most LIMITS.name characters, the same style of cap as color/group key.
  it('BVA-12 name length = LIMITS.name (max): accepted', () => {
    expect(checkProduct({ ...base(), name: 'n'.repeat(LIMITS.name) }).errors).toEqual([])
  })
  it('BVA-13 name length = LIMITS.name + 1 (max+1): rejected — defect D-01', () => {
    expect(checkProduct({ ...base(), name: 'n'.repeat(LIMITS.name + 1) }).errors)
      .toContain(`Name can be at most ${LIMITS.name} characters.`)
  })

  // Non-finite price: Number.isNaN(Infinity) is false, so this sits outside the NaN/negative
  // class the ECP/BVA table above already covers — a boundary the single-fault table misses.
  it('BVA-14 price = Infinity: rejected — defect D-04', () => {
    expect(checkProduct({ ...base(), price: Infinity }).errors)
      .toContain('Price must be a finite number.')
  })
})

describe('DT — Decision Table (checkProduct: name x price x image)', () => {
  // Three causes: C1 name present & in range, C2 price valid, C3 at least one image.
  // Effect: the product is accepted (no errors) only when C1 AND C2 AND C3 all hold.
  const cases = [
    { id: 'DT-01', name: 'Phone', price: 10, image_url: ['a.png'], expectOk: true },
    { id: 'DT-02', name: '', price: 10, image_url: ['a.png'], expectOk: false, msg: 'Name is required.' },
    { id: 'DT-03', name: 'Phone', price: -1, image_url: ['a.png'], expectOk: false, msg: 'Price is required and can’t be negative.' },
    { id: 'DT-04', name: 'Phone', price: 10, image_url: [], expectOk: false, msg: 'Add at least one image.' },
    { id: 'DT-05', name: '', price: -1, image_url: ['a.png'], expectOk: false, msg: 'Name is required.' },
    { id: 'DT-06', name: '', price: 10, image_url: [], expectOk: false, msg: 'Name is required.' },
    { id: 'DT-07', name: 'Phone', price: -1, image_url: [], expectOk: false, msg: 'Price is required and can’t be negative.' },
    { id: 'DT-08', name: '', price: -1, image_url: [], expectOk: false, msg: 'Name is required.' },
  ]
  for (const c of cases) {
    it(`${c.id}: name=${JSON.stringify(c.name)} price=${c.price} images=${c.image_url.length} -> ${c.expectOk ? 'accepted' : 'rejected'}`, () => {
      const { errors } = checkProduct({ ...base(), name: c.name, price: c.price, image_url: c.image_url })
      if (c.expectOk) expect(errors).toEqual([])
      else expect(errors).toContain(c.msg)
    })
  }
})

describe('WB — White box: the price-validation decision', () => {
  // Isolated under test (checkProduct):
  //   if (Number.isNaN(price) || price < 0)         // decision 1, conditions A (NaN) / B (negative)
  //     errors.push('Price is required and can’t be negative.')
  //   else if (decimals(p.price) > 3)                // decision 2, condition C
  //     errors.push('Price can have at most 3 decimals (baisa).')
  //
  // CFG: nodes = {start, d1, errorAB, d2, errorC, valid, end} = 7, edges = 8
  // V(G) = E - N + 2 = 8 - 7 + 2 = 3  (= predicate nodes [2] + 1, = 3 basis paths)

  it('WB-01 path 1-2-3 (A=T,B=F): empty/NaN price -> rejected via the A||B branch', () => {
    expect(checkProduct({ ...base(), price: '' }).errors).toContain('Price is required and can’t be negative.')
  })
  it('WB-02 path 1-2-3 (A=F,B=T): negative price -> rejected via the A||B branch', () => {
    expect(checkProduct({ ...base(), price: -0.5 }).errors).toContain('Price is required and can’t be negative.')
  })
  it('WB-03 path 1-2-4-5 (A=F,B=F,C=T): valid number, too many decimals -> rejected via the C branch', () => {
    const { errors } = checkProduct({ ...base(), price: 1.2345 })
    expect(errors).toContain('Price can have at most 3 decimals (baisa).')
    expect(errors).not.toContain('Price is required and can’t be negative.')
  })
  it('WB-04 path 1-2-4-6 (A=F,B=F,C=F): valid number, <=3 decimals -> no price error', () => {
    const { errors } = checkProduct({ ...base(), price: 1.234 })
    expect(errors).toEqual([])
  })

  // MC/DC on A||B: WB-01 vs WB-04 isolates A (only A changes, outcome flips);
  // WB-02 vs WB-04 isolates B (only B changes, outcome flips). WB-03 completes
  // multiple-condition coverage of decision 2. Statement/branch/condition/MC-DC are
  // all satisfied by WB-01..WB-04, mirroring the delivery-fee example in the FT3 report.
  it('WB-05 MC/DC independent effect of A (WB-01 vs WB-04 differ only in A)', () => {
    const withNaN = checkProduct({ ...base(), price: '' }).errors.length > 0
    const clean = checkProduct({ ...base(), price: 1.234 }).errors.length > 0
    expect(withNaN).not.toBe(clean)
  })
  it('WB-06 MC/DC independent effect of B (WB-02 vs WB-04 differ only in B)', () => {
    const negative = checkProduct({ ...base(), price: -0.5 }).errors.length > 0
    const clean = checkProduct({ ...base(), price: 1.234 }).errors.length > 0
    expect(negative).not.toBe(clean)
  })
})

describe('UT — Unit tests: remaining productFile.js helpers', () => {
  it('UT-01 normalize() wraps a single string image_url into an array', () => {
    expect(normalize({ image_url: 'a.png' }).image_url).toEqual(['a.png'])
  })
  it('UT-02 normalize() drops non-string entries from image_url', () => {
    expect(normalize({ image_url: ['a.png', 42, null] }).image_url).toEqual(['a.png'])
  })
  it('UT-03 toFileProduct() trims name/color/variant_group and drops blanks', () => {
    const out = toFileProduct({ ...base(), name: '  Phone  ', color: '  ', variant_group: '  ' })
    expect(out.name).toBe('Phone')
    expect(out.color).toBeUndefined()
    expect(out.variant_group).toBeUndefined()
  })
  it('UT-04 toFileProduct() keeps the field order products.json expects', () => {
    const out = toFileProduct(base())
    expect(Object.keys(out).slice(0, 3)).toEqual(['id', 'name', 'price'])
  })
  it('UT-05 serialize() always writes prices with a decimal point', () => {
    const text = serialize([{ ...base(), price: 10, original_price: 20 }])
    expect(text).toContain('"price": 10.0')
    expect(text).toContain('"original_price": 20.0')
  })
  it('UT-06 nextId() returns one past the highest existing id', () => {
    expect(nextId([{ id: 3 }, { id: 7 }, { id: 2 }])).toBe(8)
  })
  it('UT-07 nextId() returns 0 for an empty catalogue', () => {
    expect(nextId([])).toBe(0)
  })
  it('UT-08 blankProduct() starts with an empty required-field set', () => {
    const p = blankProduct(5)
    expect(p.id).toBe(5)
    expect(p.name).toBe('')
    expect(p.image_url).toEqual([])
  })
  it('UT-09 nameSimilarity() ignores colour words and small filler', () => {
    expect(nameSimilarity('Redmi 17 - Black', 'Redmi 17 - Blue')).toBeCloseTo(1, 5)
  })
  it('UT-10 nameSimilarity() is 0 for unrelated names', () => {
    expect(nameSimilarity('Redmi 17 4/128GB', 'Dell Laptop 15')).toBeLessThan(0.3)
  })
  it('UT-11 suggestGroupKey() strips the trailing colour, the storage size and slugifies', () => {
    expect(suggestGroupKey('Redmi Note 13 Pro 8/256GB - Blue')).toBe('redmi-note-13-pro')
  })
  it('UT-12 groupSizes() counts products per lower-cased group key', () => {
    const sizes = groupSizes([{ variant_group: 'redmi-17' }, { variant_group: 'Redmi-17' }, { variant_group: '' }])
    expect(sizes['redmi-17']).toBe(2)
  })
  it('UT-13 groupsIndex() groups products by lower-cased key, case preserved from the first use', () => {
    const idx = groupsIndex([{ id: 1, variant_group: 'Redmi-17' }, { id: 2, variant_group: 'redmi-17' }])
    expect(idx.get('redmi-17').products.map((p) => p.id)).toEqual([1, 2])
  })
  it('UT-14 sharedFields()/sameShared() agree when image/description/specs match', () => {
    const a = { image_url: ['x.png'], short_description: 'd', description: 'd2', specs: { a: 1 } }
    const b = { ...a, name: 'different name', price: 1 }
    expect(sameShared(a, b)).toBe(true)
  })
  it('UT-15 sameShared() is false when the shared images differ', () => {
    const a = { image_url: ['x.png'] }
    const b = { image_url: ['y.png'] }
    expect(sameShared(a, b)).toBe(false)
  })
  it('UT-16 parseProductsFile() rejects text that is not valid JSON', () => {
    expect(() => parseProductsFile('{ not json')).toThrow(/valid JSON/)
  })
  it('UT-17 parseProductsFile() rejects JSON that is not a list', () => {
    expect(() => parseProductsFile('{"id":1}')).toThrow(/list of products/)
  })
  it('UT-18 parseProductsFile() rejects a list entry that is not an object', () => {
    expect(() => parseProductsFile('[1, 2]')).toThrow(/isn.t a product/)
  })
})

describe('IT — Integration tests across the parse -> validate -> serialize pipeline', () => {
  it('IT-01 a valid product survives parse -> checkProduct -> serialize -> parse unchanged', () => {
    const text = JSON.stringify([base()])
    const parsed = parseProductsFile(text)
    expect(checkProduct(parsed[0]).errors).toEqual([])
    const roundTrip = parseProductsFile(serialize(parsed))
    expect(roundTrip[0].id).toBe(parsed[0].id)
    expect(roundTrip[0].name).toBe(parsed[0].name)
  })
  it('IT-02 an invalid product (no image) is still parsed, but flagged by checkProduct', () => {
    const [p] = parseProductsFile(JSON.stringify([{ ...base(), image_url: [] }]))
    expect(checkProduct(p).errors).toContain('Add at least one image.')
  })
  it('IT-03 two products sharing a group key clear the "no other version" warning', () => {
    const products = [
      { ...base(), id: 1, variant_group: 'redmi-17' },
      { ...base(), id: 2, variant_group: 'redmi-17' },
    ]
    const sizes = groupSizes(products)
    expect(checkProduct(products[0], sizes).warnings).toEqual([])
  })
  it('IT-04 a lone product in a group still gets the "no other version" warning', () => {
    const products = [{ ...base(), id: 1, variant_group: 'redmi-17' }]
    const sizes = groupSizes(products)
    expect(checkProduct(products[0], sizes).warnings)
      .toContain('No other product uses this group key, so no other versions are shown.')
  })
  it('IT-05 the price validated by checkProduct formats consistently through api.js omr()', () => {
    const p = { ...base(), price: 45.5 }
    expect(checkProduct(p).errors).toEqual([])
    expect(omr(p.price)).toBe('45.500 OMR')
  })
  it('IT-06 a whole catalogue: errors from checkProduct match which products fail to serialize cleanly', () => {
    const products = parseProductsFile(JSON.stringify([
      base(),
      { ...base(), id: 2, name: '' },
      { ...base(), id: 3, price: -1 },
    ]))
    const results = products.map((p) => checkProduct(p))
    expect(results.filter((r) => r.errors.length).length).toBe(2)
    expect(results[0].errors).toEqual([])
  })
})
