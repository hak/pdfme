import { PDFDocument, degrees } from '@pdfme/pdf-lib';
import * as fontkit from 'fontkit';
import type { Font, GenerateProps, SchemaInputs, Template } from '@pdfme/common';
import { getDefaultFont, getFallbackFontName, checkGenerateProps } from '@pdfme/common';
import {
  getEmbeddedPagesAndEmbedPdfBoxes,
  drawInputByTemplateSchema,
  drawEmbeddedPage,
  embedAndGetFontObj,
  InputImageCache,
} from './helper.js';
import { TOOL_NAME } from './constants.js';

const preprocessing = async (arg: {
  inputs: SchemaInputs[];
  template: Template;
  font: Font;
  options: any;
}) => {
  const { template, font, options } = arg;
  const { basePdf } = template;
  const fallbackFontName = getFallbackFontName(font);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const pdfFontObj = await embedAndGetFontObj({ pdfDoc, font });

  const pagesAndBoxes = await getEmbeddedPagesAndEmbedPdfBoxes({ pdfDoc, basePdf, options });
  const { embeddedPages, embedPdfBoxes } = pagesAndBoxes;

  return { pdfDoc, pdfFontObj, fallbackFontName, embeddedPages, embedPdfBoxes };
};

const postProcessing = (pdfDoc: PDFDocument) => {
  pdfDoc.setProducer(TOOL_NAME);
  pdfDoc.setCreator(TOOL_NAME);
};

const generate = async (props: GenerateProps) => {
  checkGenerateProps(props);
  const { inputs, template, options = {} } = props;
  const { font = getDefaultFont() } = options;
  const { schemas } = template;

  const preRes = await preprocessing({ inputs, template, font, options });
  const { pdfDoc, pdfFontObj, fallbackFontName, embeddedPages, embedPdfBoxes } = preRes;

  const inputImageCache: InputImageCache = {};
  for (let i = 0; i < inputs.length; i += 1) {
    const inputObj = inputs[i];
    const keys = Object.keys(inputObj);
    for (let j = 0; j < embeddedPages.length; j += 1) {
      const embeddedPage = embeddedPages[j];

      let { width: pageWidth, height: pageHeight } = embeddedPage;
      if (options['landscape'] === true) {
        const tmp = pageWidth;
        pageWidth = pageHeight;
        pageHeight = tmp;
      }
      const embedPdfBox = embedPdfBoxes[j];
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      drawEmbeddedPage({ page, embeddedPage, embedPdfBox, options });
      for (let l = 0; l < keys.length; l += 1) {
        const key = keys[l];
        const schema = schemas[j];
        const templateSchema = schema[key];
        const input = inputObj[key];
        const fontSetting = { font, pdfFontObj, fallbackFontName };

        await drawInputByTemplateSchema({
          input,
          templateSchema,
          pdfDoc,
          page,
          pageHeight,
          fontSetting,
          inputImageCache,
        });
      }
    }
  }

  postProcessing(pdfDoc);

  return pdfDoc.save();
};

export default generate;
