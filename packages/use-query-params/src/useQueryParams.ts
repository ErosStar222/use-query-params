import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DecodedValueMap,
  encodeQueryParams,
  QueryParamConfig,
  QueryParamConfigMap,
  StringParam,
} from 'serialize-query-params';
import { decodedParamCache } from './decodedParamCache';
import {
  expandWithInheritedParams,
  processInheritedParams,
} from './inheritedParams';
import {
  getLatestDecodedValues,
  makeStableGetLatestDecodedValues,
} from './latestValues';
import { memoParseParams } from './memoParseParams';
import { QueryParamOptions, useMergedOptions } from './options';
import { useQueryParamContext } from './QueryParamProvider';
import {
  PartialLocation,
  QueryParamConfigMapWithInherit,
  SetQuery,
  UrlUpdateType,
} from './types';

// for multiple param config
type ChangesType<DecodedValueMapType> =
  | Partial<DecodedValueMapType>
  | ((latestValues: DecodedValueMapType) => Partial<DecodedValueMapType>);

type UseQueryParamsResult<QPCMap extends QueryParamConfigMap> = [
  DecodedValueMap<QPCMap>,
  SetQuery<QPCMap>
];
type ExpandInherits<QPCMap extends QueryParamConfigMapWithInherit> = {
  [ParamName in keyof QPCMap]: QPCMap[ParamName] extends string
    ? typeof StringParam
    : QPCMap[ParamName] extends QueryParamConfig<any>
    ? QPCMap[ParamName]
    : never;
};

/**
 * Given a query parameter configuration (mapping query param name to { encode, decode }),
 * return an object with the decoded values and a setter for updating them.
 */
export function useQueryParams<
  QPCMap extends QueryParamConfigMap = QueryParamConfigMap
>(): UseQueryParamsResult<QPCMap>;
export function useQueryParams<QPCMap extends QueryParamConfigMapWithInherit>(
  names: string[],
  options?: QueryParamOptions
): UseQueryParamsResult<ExpandInherits<QPCMap>>;
export function useQueryParams<
  QPCMap extends QueryParamConfigMapWithInherit,
  OutputQPCMap extends QueryParamConfigMap = ExpandInherits<QPCMap>
>(
  paramConfigMap: QPCMap,
  options?: QueryParamOptions
): UseQueryParamsResult<OutputQPCMap>;
export function useQueryParams(
  arg1?: string[] | QueryParamConfigMapWithInherit,
  arg2?: QueryParamConfig<any> | QueryParamOptions
): UseQueryParamsResult<any> {
  const { adapter, options: contextOptions } = useQueryParamContext();
  const [stableGetLatest] = useState(makeStableGetLatestDecodedValues);

  // intepret the overloaded arguments
  const { paramConfigMap: paramConfigMapWithInherit, options } = parseArguments(
    arg1,
    arg2
  );

  const mergedOptions = useMergedOptions(contextOptions, options);

  // interpret params that were configured up the chain
  const paramConfigMap = processInheritedParams(
    paramConfigMapWithInherit,
    mergedOptions
  );

  // what is the current stringified value?
  const parsedParams = memoParseParams(
    mergedOptions.parseParams,
    adapter.location.search
  );

  // run decode on each key, collect
  const decodedValues = stableGetLatest(
    parsedParams,
    paramConfigMap,
    decodedParamCache,
    mergedOptions
  );

  // clear out unused values in cache
  // use string for relatively stable effect dependency
  const paramKeyString = Object.keys(paramConfigMap).join('\0');
  useEffect(() => {
    const paramNames = paramKeyString.split('\0');
    decodedParamCache.registerParams(paramNames);
    return () => {
      decodedParamCache.unregisterParams(paramNames);
    };
  }, [paramKeyString]);

  // create a setter for updating multiple query params at once
  // use a ref for callback dependencies so we don't generate a new one unnecessarily
  const callbackDependencies = {
    adapter,
    paramConfigMap,
    options: mergedOptions,
  } as const;
  const callbackDependenciesRef =
    useRef<typeof callbackDependencies>(callbackDependencies);
  if (callbackDependenciesRef.current == null) {
    callbackDependenciesRef.current = callbackDependencies;
  }
  useEffect(() => {
    callbackDependenciesRef.current = {
      adapter,
      paramConfigMap,
      options: mergedOptions,
    };
  }, [adapter, paramConfigMap, mergedOptions]);

  // create callback with stable identity
  const setQuery = useMemo(() => {
    const setQuery = (
      changes: ChangesType<DecodedValueMap<any>>,
      updateType?: UrlUpdateType
    ) => {
      // read from a ref so we don't generate new setters each time any change
      const {
        adapter,
        paramConfigMap: baseParamConfigMap,
        options,
      } = callbackDependenciesRef.current!;
      const { parseParams, stringifyParams } = options;
      if (updateType == null) updateType = options.updateType;

      let encodedChanges;
      const currentLocation = adapter.location;
      const parsedParams = memoParseParams(parseParams, currentLocation.search);

      // see if we have unconfigured params we can inherit to expand our config map
      const paramConfigMap = expandWithInheritedParams(
        baseParamConfigMap,
        Object.keys(changes),
        options.params
      );

      // functional updates here get the latest values
      if (typeof changes === 'function') {
        const latestValues = getLatestDecodedValues(
          parsedParams,
          paramConfigMap,
          decodedParamCache,
          options
        );
        encodedChanges = encodeQueryParams(
          paramConfigMap,
          (changes as Function)(latestValues)
        );
      } else {
        // simple update here
        encodedChanges = encodeQueryParams(paramConfigMap, changes);
      }

      // update the location and URL
      let newLocation: PartialLocation;
      if (updateType === 'push' || updateType === 'replace') {
        newLocation = {
          search: stringifyParams(encodedChanges),
          state: currentLocation.state,
        };
      } else {
        newLocation = {
          search: stringifyParams({ ...parsedParams, ...encodedChanges }),
          state: currentLocation.state,
        };
      }

      if (newLocation.search?.length && newLocation.search[0] !== '?') {
        (newLocation as any).search = `?${newLocation.search}`;
      }

      if (updateType?.startsWith('replace')) {
        adapter.replace(newLocation);
      } else {
        adapter.push(newLocation);
      }
    };

    return setQuery;
  }, []);

  return [decodedValues, setQuery];
}

export default useQueryParams;

function parseArguments(
  arg1: string[] | QueryParamConfigMapWithInherit | undefined,
  arg2: QueryParamConfig<any> | QueryParamOptions | undefined
): {
  paramConfigMap: QueryParamConfigMapWithInherit;
  options: QueryParamOptions | undefined;
} {
  let paramConfigMap: QueryParamConfigMapWithInherit;
  let options: QueryParamOptions | undefined;

  if (arg1 === undefined) {
    // useQueryParams()
    paramConfigMap = {};
    options = arg2 as QueryParamOptions | undefined;
  } else if (Array.isArray(arg1)) {
    // useQueryParams(['geo', 'other'])
    // useQueryParams(['geo', 'other'], options)
    paramConfigMap = Object.fromEntries(
      arg1.map((key) => [key, 'inherit' as const])
    );
    options = arg2 as QueryParamOptions | undefined;
  } else {
    // useQueryParams({ geo: NumberParam })
    // useQueryParams({ geo: NumberParam }, options)
    paramConfigMap = arg1;
    options = arg2 as QueryParamOptions | undefined;
  }

  return { paramConfigMap, options };
}
