// Destinations et activités en GraphQL : la page d'une destination, sa fiche pays et
// les mutations de l'itinéraire. Chaque document a un nom d'opération, que Django
// écrit dans ses journaux et que MSW utilise dans les tests.
import "server-only";

import { cache } from "react";
import { gqlFetch } from "@/lib/api/graphql";
import { toGqlId } from "@/lib/api/mappers";
import { ApiError, UNEXPECTED_RESPONSE } from "@/lib/errors";
import type {
  ActivityCreateInput,
  ActivityUpdateInput,
  CreateActivityMutation,
  CreateActivityMutationVariables,
  CreateDestinationMutation,
  CreateDestinationMutationVariables,
  DeleteActivityMutation,
  DeleteActivityMutationVariables,
  DeleteDestinationMutation,
  DeleteDestinationMutationVariables,
  DestinationCountryQuery,
  DestinationCountryQueryVariables,
  DestinationCreateInput,
  DestinationPageQuery,
  DestinationPageQueryVariables,
  DestinationUpdateInput,
  GqlActivity,
  GqlCountryInfo,
  GqlDeleteResult,
  GqlDestination,
  GqlDestinationPage,
  UpdateActivityMutation,
  UpdateActivityMutationVariables,
  UpdateDestinationMutation,
  UpdateDestinationMutationVariables,
} from "@/types/graphql";

// Fragments : les mêmes champs pour la query et pour les mutations.
const DESTINATION_FIELDS = `
  fragment DestinationFields on Destination {
    id
    order
    city
    country
    countryCode
    arrivalDate
    departureDate
    latitude
    longitude
  }
`;

const ACTIVITY_FIELDS = `
  fragment ActivityFields on Activity {
    id
    name
    description
    category
    date
    startTime
    cost
  }
`;

export const DESTINATION_PAGE_QUERY = `
  query DestinationPage($id: ID!) {
    destination(id: $id) {
      ...DestinationFields
      trip {
        id
        title
        status
        startDate
        endDate
        myRole
      }
      activities {
        ...ActivityFields
      }
    }
  }
  ${DESTINATION_FIELDS}
  ${ACTIVITY_FIELDS}
`;

// Chargée à part, sous Suspense : Countries GraphQL peut être lent.
export const DESTINATION_COUNTRY_QUERY = `
  query DestinationCountry($id: ID!) {
    destination(id: $id) {
      id
      countryInfo {
        code
        name
        native
        capital
        emoji
        currency
        currencies
        continent
        languages {
          name
          native
        }
      }
    }
  }
`;

export const CREATE_DESTINATION_MUTATION = `
  mutation CreateDestination($input: DestinationCreateInput!) {
    createDestination(input: $input) {
      destination {
        ...DestinationFields
      }
    }
  }
  ${DESTINATION_FIELDS}
`;

export const UPDATE_DESTINATION_MUTATION = `
  mutation UpdateDestination($id: ID!, $input: DestinationUpdateInput!) {
    updateDestination(id: $id, input: $input) {
      destination {
        ...DestinationFields
      }
    }
  }
  ${DESTINATION_FIELDS}
`;

export const DELETE_DESTINATION_MUTATION = `
  mutation DeleteDestination($id: ID!) {
    deleteDestination(id: $id) {
      ok
      id
    }
  }
`;

export const CREATE_ACTIVITY_MUTATION = `
  mutation CreateActivity($input: ActivityCreateInput!) {
    createActivity(input: $input) {
      activity {
        ...ActivityFields
      }
    }
  }
  ${ACTIVITY_FIELDS}
`;

export const UPDATE_ACTIVITY_MUTATION = `
  mutation UpdateActivity($id: ID!, $input: ActivityUpdateInput!) {
    updateActivity(id: $id, input: $input) {
      activity {
        ...ActivityFields
      }
    }
  }
  ${ACTIVITY_FIELDS}
`;

export const DELETE_ACTIVITY_MUTATION = `
  mutation DeleteActivity($id: ID!) {
    deleteActivity(id: $id) {
      ok
      id
    }
  }
`;

/**
 * Le schéma déclare nullables la destination et le résultat des mutations. Sans erreur
 * dans errors[], ils sont toujours remplis. Sinon, la réponse est anormale.
 */
function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new ApiError({
      status: 200,
      code: UNEXPECTED_RESPONSE,
      message: `Réponse GraphQL sans ${field}.`,
    });
  }
  return value;
}

/** Query DestinationPage : la destination, son voyage et ses activités. */
export const getDestinationPage = cache(
  async (id: number | string): Promise<GqlDestinationPage> => {
    const data = await gqlFetch<DestinationPageQuery, DestinationPageQueryVariables>(
      DESTINATION_PAGE_QUERY,
      { id: toGqlId(id) },
    );
    return required(data.destination, "destination");
  },
);

/** Query DestinationCountry : la fiche pays, ou null si Countries GraphQL n'a rien. */
export async function getDestinationCountry(id: number | string): Promise<GqlCountryInfo | null> {
  const data = await gqlFetch<DestinationCountryQuery, DestinationCountryQueryVariables>(
    DESTINATION_COUNTRY_QUERY,
    { id: toGqlId(id) },
  );
  return required(data.destination, "destination").countryInfo;
}

export async function createDestination(input: DestinationCreateInput): Promise<GqlDestination> {
  const data = await gqlFetch<CreateDestinationMutation, CreateDestinationMutationVariables>(
    CREATE_DESTINATION_MUTATION,
    { input },
  );
  return required(data.createDestination?.destination, "createDestination.destination");
}

export async function updateDestination(
  id: number | string,
  input: DestinationUpdateInput,
): Promise<GqlDestination> {
  const data = await gqlFetch<UpdateDestinationMutation, UpdateDestinationMutationVariables>(
    UPDATE_DESTINATION_MUTATION,
    { id: toGqlId(id), input },
  );
  return required(data.updateDestination?.destination, "updateDestination.destination");
}

/** Supprime la destination et ses activités. */
export async function deleteDestination(id: number | string): Promise<GqlDeleteResult> {
  const data = await gqlFetch<DeleteDestinationMutation, DeleteDestinationMutationVariables>(
    DELETE_DESTINATION_MUTATION,
    { id: toGqlId(id) },
  );
  return required(data.deleteDestination, "deleteDestination");
}

export async function createActivity(input: ActivityCreateInput): Promise<GqlActivity> {
  const data = await gqlFetch<CreateActivityMutation, CreateActivityMutationVariables>(
    CREATE_ACTIVITY_MUTATION,
    { input },
  );
  return required(data.createActivity?.activity, "createActivity.activity");
}

export async function updateActivity(
  id: number | string,
  input: ActivityUpdateInput,
): Promise<GqlActivity> {
  const data = await gqlFetch<UpdateActivityMutation, UpdateActivityMutationVariables>(
    UPDATE_ACTIVITY_MUTATION,
    { id: toGqlId(id), input },
  );
  return required(data.updateActivity?.activity, "updateActivity.activity");
}

export async function deleteActivity(id: number | string): Promise<GqlDeleteResult> {
  const data = await gqlFetch<DeleteActivityMutation, DeleteActivityMutationVariables>(
    DELETE_ACTIVITY_MUTATION,
    { id: toGqlId(id) },
  );
  return required(data.deleteActivity, "deleteActivity");
}
