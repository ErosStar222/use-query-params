import * as React from 'react';
import { QueryParamConfig, StringParam } from 'serialize-query-params';
import { getSSRSafeSearchString, useUpdateRefIfShallowNew } from './helpers';
import { useLocationContext } from './LocationProvider';
import { sharedMemoizedQueryParser } from './memoizedQueryParser';
import shallowEqual from './shallowEqual';
import { UrlUpdateType } from './types';

type NewValueType<D> = D | ((latestValue: D) => D);

/**
 * Given a query param name and query parameter configuration ({ encode, decode })
 * return the decoded value and a setter for updating it.
 *
 * The setter takes two arguments (newValue, updateType) where updateType
 * is one of 'replace' | 'replaceIn' | 'push' | 'pushIn', defaulting to
 * 'pushIn'.
 *
 * You may optionally pass in a rawQuery object, otherwise the query is derived
 * from the location available in the context.
 *
 * D = decoded type
 * D2 = return value from decode (typically same as D)
 */
export const useQueryParam = <D, D2 = D>(
  name: string,
  paramConfig: QueryParamConfig<D, D2> = StringParam as QueryParamConfig<any>
): [
  D2 | undefined,
  (newValue: NewValueType<D>, updateType?: UrlUpdateType) => void
] => {
  const [getLocation, setLocation] = useLocationContext();

  // read in the raw query
  const parsedQuery = sharedMemoizedQueryParser(
    getSSRSafeSearchString(getLocation())
  );

  // make caches
  const encodedValueCacheRef = React.useRef(parsedQuery[name]);
  const paramConfigRef = React.useRef(paramConfig);
  const decodedValueCacheRef = React.useRef<D2 | undefined>();

  function getLatestDecodedValue(): D2 {
    // get the latest location object
    const location = getLocation();

    // read in the parsed query
    const parsedQuery = sharedMemoizedQueryParser(
      getSSRSafeSearchString(location)
    );

    // read in the encoded string value (we have to check cache if available because
    // sometimes the query string changes so we get a new parsedQuery but this value
    // didn't change, so we should avoid generating a new array or whatever value)
    const hasNewEncodedValue = !shallowEqual(
      encodedValueCacheRef.current,
      parsedQuery[name]
    );
    const encodedValue = hasNewEncodedValue
      ? parsedQuery[name]
      : encodedValueCacheRef.current;

    // check if we have a new param config
    const hasNewParamConfig = !shallowEqual(
      paramConfigRef.current,
      paramConfig
    );

    let decodedValue: D2;
    // only decode if we have changes to encoded value or the config.
    // check for undefined to handle initial case
    if (
      hasNewEncodedValue ||
      hasNewParamConfig ||
      decodedValueCacheRef.current === undefined
    ) {
      const newDecodedValue = paramConfig.decode(encodedValue);
      const hasNewDecodedValue = !shallowEqual(
        decodedValueCacheRef.current,
        newDecodedValue
      );

      // if we have a new decoded value use it, otherwise use cached
      if (hasNewDecodedValue) {
        decodedValue = newDecodedValue;
      } else {
        decodedValue = decodedValueCacheRef.current as D2;
      }
    } else {
      // no changes to encoded value or param config map, so use cached
      decodedValue = decodedValueCacheRef.current;
    }

    return decodedValue;
  }

  const decodedValue = getLatestDecodedValue();

  // update cached values in a useEffect
  useUpdateRefIfShallowNew(encodedValueCacheRef, parsedQuery[name]);
  useUpdateRefIfShallowNew(paramConfigRef, paramConfig);
  useUpdateRefIfShallowNew(decodedValueCacheRef, decodedValue);

  // create the setter callback
  function setValueCallback(
    newValue: NewValueType<D>,
    updateType?: UrlUpdateType
  ): void {
    let newEncodedValue: string | (string | null)[] | null | undefined;

    // allow functional updates #26
    if (typeof newValue === 'function') {
      // get latest decoded value to pass as a fresh arg to the setter fn
      const latestValue = getLatestDecodedValue();
      decodedValueCacheRef.current = latestValue; // keep cache in sync

      newEncodedValue = (newValue as Function)(latestValue);
    } else {
      newEncodedValue = paramConfig.encode(newValue);
    }

    // update the URL
    setLocation({ [name]: newEncodedValue }, updateType);
  }

  // create the setter, memoizing via useCallback
  const setValue = React.useCallback(setValueCallback, [
    paramConfig,
    name,
    setLocation,
  ]);

  return [decodedValue, setValue];
};
