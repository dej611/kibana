/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import { FtrProviderContext } from '../../../ftr_provider_context';

export default function ({ getService, getPageObjects }: FtrProviderContext) {
  const PageObjects = getPageObjects(['visualize', 'lens', 'common', 'header']);
  const find = getService('find');
  const testSubjects = getService('testSubjects');
  const filterBar = getService('filterBar');
  const retry = getService('retry');

  describe('lens fields list tests', () => {
    describe('form-based datasource', () => {
      it('should show all fields as available', async () => {
        await PageObjects.visualize.navigateToNewVisualization();
        await PageObjects.visualize.clickVisType('lens');
        await PageObjects.lens.goToTimeRange();

        expect(
          await (await testSubjects.find('lnsIndexPatternAvailableFields-count')).getVisibleText()
        ).to.eql(52);
      });

      it('should show a histogram and top values popover for numeric field', async () => {
        const [fieldId] = await PageObjects.lens.findFieldIdsByType('number');
        await testSubjects.click(fieldId);
        // check for popover
        await testSubjects.exists('lnsFieldListPanel-title');
        // check for top values chart
        await testSubjects.existOrFail('lnsFieldListPanel-topValues');
        // switch to date histogram
        await testSubjects.click('lnsFieldListPanel-distribution');
        // check for date histogram chart
        expect(
          await find.existsByCssSelector(
            '[data-test-subj="lnsFieldListPanelFieldContent"] .echChart'
          )
        ).to.eql(true);
      });

      it('should show a top values popover for a keyword field', async () => {
        const [fieldId] = await PageObjects.lens.findFieldIdsByType('string');
        await testSubjects.click(fieldId);
        // check for popover
        await testSubjects.exists('lnsFieldListPanel-title');
        // check for top values chart
        await testSubjects.existOrFail('lnsFieldListPanel-topValues');
        // check no date histogram
        expect(
          await find.existsByCssSelector(
            '[data-test-subj="lnsFieldListPanelFieldContent"] .echChart'
          )
        ).to.eql(false);
      });

      it('should show a date histogram popover for a date field', async () => {
        const [fieldId] = await PageObjects.lens.findFieldIdsByType('date');
        await testSubjects.click(fieldId);
        // check for popover
        await testSubjects.exists('lnsFieldListPanel-title');
        // check for date histogram chart
        expect(
          await find.existsByCssSelector(
            '[data-test-subj="lnsFieldListPanelFieldContent"] .echChart'
          )
        ).to.eql(true);
        // check no top values chart
        await testSubjects.missingOrFail('lnsFieldListPanel-topValues');
      });

      it('should change popover content if user defines a filter that affects field values', async () => {
        // check the current records count for stats
        const [fieldId] = await PageObjects.lens.findFieldIdsByType('string');
        await testSubjects.click(fieldId);
        const valuesCount = parseInt(
          (await testSubjects.getVisibleText('lnsFieldListPanel-statsFooter'))
            .replaceAll(/(Calculated from | records\.)/g, '')
            .replace(',', ''),
          10
        );
        // define a filter
        await filterBar.addFilter('geo.src', 'is', 'CN');
        await retry.waitFor('Wait for the filter to take effect', async () => {
          await testSubjects.click(fieldId);
          // check for top values chart has changed compared to the previous test
          const newValuesCount = parseInt(
            (await testSubjects.getVisibleText('lnsFieldListPanel-statsFooter'))
              .replaceAll(/(Calculated from | records\.)/g, '')
              .replace(',', ''),
            10
          );
          return newValuesCount < valuesCount;
        });
      });

      // Fields cap limitation is to not know when an index has no fields based on filters
      it('should detect fields have no data in popup if filter excludes them', async () => {
        await filterBar.removeAllFilters();
        await filterBar.addFilter('bytes', 'is', '-1');
        // check via popup fields have no data
        const [fieldId] = await PageObjects.lens.findFieldIdsByType('string');
        await testSubjects.click(fieldId);
        await retry.waitFor(
          'Waiting for summary data to load',
          async () => (await testSubjects.find('lnsFieldListPanel-missingContent')) != null
        );
      });

      it('should move some fields as empty when the time range excludes them', async () => {
        // remove the filter
        await filterBar.removeAllFilters();
        // tweak the time range to 17 Sept 2015 to 18 Sept 2015
        await PageObjects.lens.goToTimeRange(
          'Sep 17, 2015 @ 06:31:44.000',
          'Sep 18, 2015 @ 06:31:44.000'
        );
        // check all fields are empty now
        expect(
          await (await testSubjects.find('lnsIndexPatternEmptyFields-count')).getVisibleText()
        ).to.eql(52);
        // check avaialble count is 0
        expect(
          await (await testSubjects.find('lnsIndexPatternAvailableFields-count')).getVisibleText()
        ).to.eql(0);
      });
    });
  });
}
