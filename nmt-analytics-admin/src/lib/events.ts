export type EntityType = 'packages' | 'customers' | 'reservations' | 'departures' | 'transactions' | 'payments' | 'analytics';

/**
 * Global event bus for data invalidation.
 * Uses native CustomEvents for zero dependencies and global reach.
 */
export const dataEvents = {
    /**
     * Emit an invalidation event for a specific entity or 'all'
     */
    emit(entity: EntityType | 'all') {
        const event = new CustomEvent('travline:data_invalidated', {
            detail: { entity }
        });
        window.dispatchEvent(event);
        console.debug(`[events] Data invalidated for: ${entity}`);
    },

    /**
     * Subscribe to invalidation events
     */
    subscribe(callback: (entity: EntityType | 'all') => void) {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent).detail;
            callback(detail.entity);
        };

        window.addEventListener('travline:data_invalidated', handler);
        return () => window.removeEventListener('travline:data_invalidated', handler);
    }
};
