/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { tags } from '@kbn/scout';
import { expect } from '@kbn/scout/ui';
import { spaceTest as test } from '../../fixtures';

const EXPERIMENTAL_FEATURES_SETTING = 'workflows:experimentalFeatures';

const SECTIONED_WORKFLOW = `name: scout-sections
enabled: true
triggers:
  - type: manual
steps:
  - name: ingest
    type: section
    title: Ingest alerts
    steps:
      - name: fetch
        type: console
        with:
          message: fetching
      - name: parse
        type: console
        with:
          message: parsing
  - name: triage
    type: section
    title: Triage
    steps: []
`;

test.describe(
  'Workflow graph — sections',
  {
    tag: [
      ...tags.stateful.classic,
      ...tags.serverless.observability.complete,
      ...tags.serverless.security.complete,
    ],
  },
  () => {
    test.beforeAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.set({ [EXPERIMENTAL_FEATURES_SETTING]: true });
    });

    test.beforeEach(async ({ browserAuth }) => {
      await browserAuth.loginAsPrivilegedUser();
    });

    test.afterAll(async ({ scoutSpace }) => {
      await scoutSpace.uiSettings.unset(EXPERIMENTAL_FEATURES_SETTING);
    });

    // Nothing is saved in either test: the workflow is client-side editor state only,
    // so no workflow is left behind to clean up.
    test('adds a section from the canvas, fills it, then collapses and expands it', async ({
      pageObjects,
      page,
    }) => {
      const { workflowEditor, workflowGraphAuthoring: authoring } = pageObjects;
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await test.step('starts a new workflow with a Manual trigger', async () => {
        await workflowEditor.gotoNewWorkflow();
        await workflowEditor.graphCanvas.waitFor({ state: 'visible' });
        await authoring.openAddTriggerFromEmptyCanvas();
        await authoring.pickTrigger('Manual');
        await authoring.saveTrigger();
      });

      await test.step('adds an empty section from the Actions menu and names it', async () => {
        await authoring.openAddStepFromWire({ mode: 'prepend-step' });
        await authoring.pickActionFromMenu('Section');
        await authoring.renameCurrentStep('ingest');
        await authoring.closeStepPanel();

        await expect(page.testSubj.locator('workflowGraphSectionGroupHeader')).toBeVisible();
      });

      await test.step('fills the empty section with a step', async () => {
        await authoring.openAddFirstStepInSection();
        await authoring.pickActionFromMenu('Console');
        await authoring.renameCurrentStep('say_hello');
        await authoring.closeStepPanel();
      });

      await test.step('collapses it to one node that says what it hides', async () => {
        await authoring.sectionToggle('Ingest', 'expanded').click();

        await expect(page.testSubj.locator('workflowGraphNode-ingest')).toBeVisible();
        await expect(page.testSubj.locator('workflowGraphSectionCount')).toHaveText('1 step');
      });

      await test.step('expands it again', async () => {
        await authoring.sectionToggle('Ingest', 'collapsed').click();

        await expect(page.testSubj.locator('workflowGraphSectionGroupHeader')).toBeVisible();
      });

      await test.step('the YAML holds the section with its step inside', async () => {
        const yaml = await workflowEditor.getYamlEditorValue();

        expect(yaml).toContain('name: ingest');
        expect(yaml).toContain('type: section');
        expect(yaml).toMatch(/steps:\s*\n\s+- name: say_hello/);
      });

      expect(pageErrors).toStrictEqual([]);
    });

    test('shows sections written in YAML, and keeps their collapsed state out of the YAML', async ({
      pageObjects,
      page,
    }) => {
      const { workflowEditor, workflowGraphAuthoring: authoring } = pageObjects;

      await test.step('opens a new workflow and replaces its YAML with sections', async () => {
        await workflowEditor.gotoNewWorkflow();
        await workflowEditor.switchToYamlView();
        await workflowEditor.setYamlEditorValue(SECTIONED_WORKFLOW);
        await workflowEditor.switchToGraphView();
      });

      await test.step('draws both sections as frames, one of them empty', async () => {
        await expect(page.testSubj.locator('workflowGraphSectionGroupHeader')).toHaveCount(2);
        await expect(page.testSubj.locator('workflowGraphSectionAddFirstStep')).toBeVisible();
      });

      await test.step('collapses the filled section, which lists how many steps it hides', async () => {
        await authoring.sectionToggle('Ingest alerts', 'expanded').click();

        await expect(page.testSubj.locator('workflowGraphNode-ingest')).toBeVisible();
        await expect(page.testSubj.locator('workflowGraphSectionCount')).toHaveText('2 steps');
      });

      await test.step('collapsing did not change the YAML', async () => {
        await workflowEditor.switchToYamlView();

        expect(await workflowEditor.getYamlEditorValue()).toContain('title: Ingest alerts');
        expect(await workflowEditor.getYamlEditorValue()).not.toContain('collapsed');
      });
    });
  }
);
