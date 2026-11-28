import {useEffect, useState} from 'react';
import type {ReactElement} from 'react';
import {createHashRouter, RouterProvider} from 'react-router-dom';
import type {AppDataSource} from '../shared/data/contracts';
import {createAppDataSource} from '../shared/data/createAppDataSource';
import {AppRoutes} from './routes';
import {TelegramLifecycle} from './TelegramLifecycle';

export function App({source: suppliedSource}: {source?: AppDataSource}): ReactElement {
  const [source] = useState(() => suppliedSource ?? createAppDataSource());
  const [router, setRouter] = useState<ReturnType<typeof createHashRouter>>();
  useEffect(() => {
    const instance = createHashRouter([{path: '*', element: <AppRoutes source={source} />}]);
    // Router initialization registers listeners; the effect ensures StrictMode cleanup.
    // oxlint-disable-next-line react/set-state-in-effect -- Router creation and disposal are coupled.
    setRouter(instance);
    return () => instance.dispose();
  }, [source]);
  return (
    <TelegramLifecycle>
      {router && <RouterProvider router={router} />}
    </TelegramLifecycle>
  );
}
