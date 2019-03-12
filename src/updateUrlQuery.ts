import { stringify, parse as parseQueryString } from 'query-string';
import { UrlUpdateType } from './types';

interface EncodedQuery {
  [key: string]: string;
}

interface EncodedQueryWithNulls {
  [key: string]: string | null | undefined;
}

interface WrappedHistory {
  push: (location: Location) => void;
  replace: (location: Location) => void;
}

function mergeLocationQueryOrSearch(
  location: Location,
  newQuery: EncodedQuery
): Location {
  // if location.query exists, update the query in location. otherwise update the search string
  // replace location.query
  let newLocation: Location;
  if ((location as any).query) {
    newLocation = {
      ...location,
      query: newQuery,
      search: '', // this is necessary at least for React Router v4
    } as any;
  } else {
    // replace location.search
    const queryStr = stringify(newQuery);
    newLocation = {
      ...location,
      search: queryStr.length ? `?${queryStr}` : '',
    };
  }

  // remove react router key
  // if (newLocation.key) {
  // delete newLocation.key;
  // }

  return newLocation;
}

// remove query params that are nully or an empty strings.
// note: these values are assumed to be already encoded as strings.
function filterNully(query: EncodedQueryWithNulls): EncodedQuery {
  const filteredQuery: EncodedQuery = Object.keys(query).reduce(
    (queryAccumulator: any, queryParam: string) => {
      const encodedValue = query[queryParam];
      if (encodedValue != null && encodedValue !== '') {
        queryAccumulator[queryParam] = encodedValue;
      }

      return queryAccumulator;
    },
    {}
  );

  return filteredQuery;
}

function updateLocation(newQuery: EncodedQueryWithNulls, location: Location) {
  return mergeLocationQueryOrSearch(location, filterNully(newQuery));
}

/**
 * Update multiple parts of the location at once
 */
function updateInLocation(
  queryReplacements: EncodedQueryWithNulls,
  location: Location
) {
  // if a query is there, use it, otherwise parse the search string
  const currQuery =
    (location as any).query || parseQueryString(location.search);

  const newQuery = {
    ...currQuery,
    ...queryReplacements,
  };

  return updateLocation(filterNully(newQuery), location);
}

/**
 * Updates a multiple values in a query based on the type
 */
export function updateUrlQuery(
  queryReplacements: EncodedQueryWithNulls,
  location: Location,
  history: WrappedHistory,
  updateType: UrlUpdateType = 'replaceIn'
): void {
  switch (updateType) {
    case 'replaceIn':
      history.replace(updateInLocation(queryReplacements, location));
      break;
    case 'pushIn':
      history.push(updateInLocation(queryReplacements, location));
      break;
    case 'replace':
      history.replace(updateLocation(queryReplacements, location));
      break;
    case 'push':
      history.push(updateLocation(queryReplacements, location));
      break;
    default:
  }
}

export default updateUrlQuery;
