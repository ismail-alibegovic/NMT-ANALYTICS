import { useEffect, useRef } from 'react';
import { dataEvents, EntityType } from '../lib/events';

/**
 * Reusable hook to automatically trigger a refetch when a specific entity is modified globally.
 * 
 * @param entity The entity to listen for (e.g. 'packages', 'customers')
 * @param onInvalidate Callback to trigger refetch
 */
export function useDataInvalidation(entity: EntityType | EntityType[], onInvalidate: () => void) {
    const callbackRef = useRef(onInvalidate);

    // Keep callback ref updated to avoid stale closures in useEffect
    useEffect(() => {
        callbackRef.current = onInvalidate;
    }, [onInvalidate]);

    useEffect(() => {
        const entities = Array.isArray(entity) ? entity : [entity];

        const unsubscribe = dataEvents.subscribe((invalidatedEntity) => {
            if (invalidatedEntity === 'all' || entities.includes(invalidatedEntity as EntityType)) {
                console.debug(`[useDataInvalidation] Triggering refetch for: ${invalidatedEntity}`);
                callbackRef.current();
            }
        });

        return unsubscribe;
    }, [entity]);
}
