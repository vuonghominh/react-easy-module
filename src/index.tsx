import React from 'react';
import { ConnectedRouter } from 'connected-react-router';
import { History } from 'history';

export const sum = (a: number, b: number): number => a + b

type Props = {
  history: History,
}

export const RootModule: React.FC<Props> = ({children, history}) => (
  <ConnectedRouter history={history}>
    {children}
  </ConnectedRouter>
)