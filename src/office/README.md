# Office document services

The Office layer provides read-only analysis of modern OOXML files:

- `.xlsx` and `.xlsm`;
- `.pptx` and `.pptm`.

Legacy `.xls` and `.ppt` files must be converted before analysis.

## Safety

- VBA projects are detected but never executed.
- External workbook links are reported but never refreshed.
- Formula text and cached results may be inspected, but formulas are not
  recalculated by the parser.
- Office documents are treated as untrusted input.
- Extracted outputs use workspace-bound atomic writes and refuse accidental
  overwrite.
- Optional slide rendering and Office recalculation remain capability-gated
  behind LibreOffice and are not part of this bootstrap.

## Dependencies

- `exceljs` reads modern Excel workbooks;
- `fflate` reads OOXML ZIP packages;
- `fast-xml-parser` parses the XML parts inside PowerPoint and workbook
  packages.
