/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { parse } from 'query-string';
import {
  EuiButton,
  EuiLink,
  EuiLoadingSpinner,
  EuiPageTemplate,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';

import { useHistory, useLocation } from 'react-router-dom';
import { METRIC_TYPE } from '@kbn/analytics';
import { i18n } from '@kbn/i18n';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import type { GuideFilterValues, GuideId, GuideState } from '@kbn/guided-onboarding';

import { GuideCards, GuideFilters } from '@kbn/guided-onboarding';
import { getServices } from '../../kibana_services';
import { KEY_ENABLE_WELCOME } from '../home';

const homeBreadcrumb = i18n.translate('home.breadcrumbs.homeTitle', { defaultMessage: 'Home' });
const gettingStartedBreadcrumb = i18n.translate('home.breadcrumbs.gettingStartedTitle', {
  defaultMessage: 'Setup guides',
});
const title = i18n.translate('home.guidedOnboarding.gettingStarted.useCaseSelectionTitle', {
  defaultMessage: 'What would you like to do first?',
});
const subtitle = i18n.translate('home.guidedOnboarding.gettingStarted.useCaseSelectionSubtitle', {
  defaultMessage: `Select a guide to help you make the most of your data.`,
});
const skipText = i18n.translate('home.guidedOnboarding.gettingStarted.skip.buttonLabel', {
  defaultMessage: `I’d like to explore on my own.`,
});

export const GettingStarted = () => {
  const { application, trackUiMetric, chrome, guidedOnboardingService, cloud, cloudChat } =
    getServices();

  const [guidesState, setGuidesState] = useState<GuideState[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const { search } = useLocation();
  const query = parse(search);

  const isTypeOfGuideFilterValue = (useCase: string | string[] | null) => {
    const filterValues: string[] = ['search', 'observability', 'security', 'all']; // list of GuideFilterValues types

    if (!useCase) {
      return false;
    }

    if (useCase instanceof Array) {
      return filterValues.includes(useCase[0]);
    }

    return filterValues.includes(useCase);
  };

  const [filter, setFilter] = useState<GuideFilterValues>(
    isTypeOfGuideFilterValue(query.useCase) ? (query.useCase as GuideFilterValues) : 'all'
  );
  const history = useHistory();

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        // using # prevents a reloading of the whole app when clicking the breadcrumb
        href: '#',
        text: homeBreadcrumb,
        onClick: () => {
          trackUiMetric(METRIC_TYPE.CLICK, 'guided_onboarding__home_breadcrumb');
        },
      },
      {
        text: gettingStartedBreadcrumb,
      },
    ]);
  }, [chrome, trackUiMetric]);

  const fetchGuidesState = useCallback(async () => {
    setIsLoading(true);
    setIsError(false);
    try {
      const allGuides = await guidedOnboardingService?.fetchAllGuidesState();
      setIsLoading(false);
      if (allGuides) {
        setGuidesState(allGuides.state);
      }
    } catch (error) {
      setIsLoading(false);
      setIsError(true);
    }
  }, [guidedOnboardingService]);

  useEffect(() => {
    fetchGuidesState();
  }, [fetchGuidesState]);

  useEffect(() => {
    if (cloud?.isCloudEnabled === false) {
      return history.push('/');
    }
  }, [cloud, history]);

  useEffect(() => {
    // disable welcome screen on the home page
    localStorage.setItem(KEY_ENABLE_WELCOME, JSON.stringify(false));
  }, []);

  const onSkip = async () => {
    try {
      await guidedOnboardingService?.skipGuidedOnboarding();
    } catch (error) {
      // if the state update fails, it's safe to ignore the error
    }
    trackUiMetric(METRIC_TYPE.CLICK, 'guided_onboarding__skipped');
    application.navigateToApp('home');
  };

  const activateGuide = useCallback(
    async (guideId: GuideId, guideState?: GuideState) => {
      try {
        await guidedOnboardingService?.activateGuide(guideId, guideState);
      } catch (err) {
        getServices().toastNotifications.addDanger({
          title: i18n.translate('home.guidedOnboarding.gettingStarted.activateGuide.errorMessage', {
            defaultMessage: 'Unable to start the guide. Wait a moment and try again.',
          }),
          text: err.message,
        });
      }
    },
    [guidedOnboardingService]
  );

  if (isLoading) {
    return (
      <KibanaPageTemplate.EmptyPrompt
        title={<EuiLoadingSpinner size="xl" />}
        body={
          <EuiText color="subdued">
            {i18n.translate('home.guidedOnboarding.gettingStarted.loadingIndicator', {
              defaultMessage: 'Loading the guide state...',
            })}
          </EuiText>
        }
        data-test-subj="onboarding--loadingIndicator"
      />
    );
  }

  if (isError) {
    return (
      <KibanaPageTemplate.EmptyPrompt
        iconType="warning"
        color="danger"
        title={
          <h2>
            {i18n.translate('home.guidedOnboarding.gettingStarted.errorSectionTitle', {
              defaultMessage: 'Unable to load the guide state',
            })}
          </h2>
        }
        body={
          <>
            <EuiText color="subdued">
              {i18n.translate('home.guidedOnboarding.gettingStarted.errorSectionDescription', {
                defaultMessage: `The guide couldn't be loaded. Wait a moment and try again.`,
              })}
            </EuiText>
            <EuiSpacer />
            <EuiButton
              iconSide="right"
              onClick={fetchGuidesState}
              iconType="refresh"
              color="danger"
            >
              {i18n.translate('home.guidedOnboarding.gettingStarted.errorSectionRefreshButton', {
                defaultMessage: 'Refresh',
              })}
            </EuiButton>
          </>
        }
        data-test-subj="onboarding--errorSection"
      />
    );
  }

  return (
    <KibanaPageTemplate panelled={false} grow>
      <EuiPageTemplate.Section alignment="center" data-test-subj="guided-onboarding--landing-page">
        <EuiTitle size="l" className="eui-textCenter">
          <h1>{title}</h1>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiText size="m" textAlign="center">
          <p>{subtitle}</p>
        </EuiText>
        <EuiSpacer size="xxl" />
        <GuideFilters
          application={application}
          activeFilter={filter}
          setActiveFilter={setFilter}
          data-test-subj="onboarding--guideFilters"
        />
        <EuiSpacer size="xxl" />
        <GuideCards
          activateGuide={activateGuide}
          navigateToApp={application.navigateToApp}
          activeFilter={filter}
          guidesState={guidesState}
        />
        <EuiSpacer />
        <div className="eui-textCenter">
          {/* data-test-subj used for FS tracking */}
          <EuiLink onClick={onSkip} data-test-subj="onboarding--skipGuideLink">
            {skipText}
          </EuiLink>
        </div>
        {cloudChat?.Chat && <cloudChat.Chat />}
      </EuiPageTemplate.Section>
    </KibanaPageTemplate>
  );
};
