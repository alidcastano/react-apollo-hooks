import { ApolloClient } from 'apollo-client';
import { ApolloLink, DocumentNode, Observable } from 'apollo-link';
import gql from 'graphql-tag';
import { withProfiler } from 'jest-react-profiler';
import React, { Fragment, Suspense, SuspenseProps } from 'react';
import { cleanup, render } from 'react-testing-library';

import { ApolloProvider, QueryHookOptions, useQuery } from '..';
import createClient from '../__testutils__/createClient';
import { SAMPLE_TASKS } from '../__testutils__/data';
import flushEffectsAndWait from '../__testutils__/flushEffectsAndWait';
import noop from '../__testutils__/noop';

const TASKS_MOCKS = [
  {
    request: {
      query: gql`
        query TasksQuery {
          tasks {
            id
            text
            completed
            __typename
          }
        }
      `,
      variables: {},
    },
    result: {
      data: {
        __typename: 'Query',
        tasks: [...SAMPLE_TASKS],
      },
    },
  },

  {
    request: {
      query: gql`
        query FilteredTasksQuery($completed: Boolean!) {
          tasks(completed: $completed) {
            id
            text
            completed
            __typename
          }
        }
      `,
      variables: {
        completed: true,
      },
    },
    result: {
      data: {
        __typename: 'Query',
        tasks: SAMPLE_TASKS.filter(task => task.completed),
      },
    },
  },

  {
    request: {
      query: gql`
        query FilteredTasksQuery($completed: Boolean!) {
          tasks(completed: $completed) {
            id
            text
            completed
            __typename
          }
        }
      `,
      variables: {
        completed: false,
      },
    },
    result: {
      data: {
        __typename: 'Query',
        tasks: SAMPLE_TASKS.filter(task => !task.completed),
      },
    },
  },
];

const TASKS_QUERY = gql`
  query TasksQuery {
    tasks {
      id
      text
      completed
    }
  }
`;

const FILTERED_TASKS_QUERY = gql`
  query FilteredTasksQuery($completed: Boolean!) {
    tasks(completed: $completed) {
      id
      text
      completed
    }
  }
`;

const linkReturningError = new ApolloLink(
  () =>
    new Observable(observer => {
      observer.error(new Error('Simulating network error'));
    })
);

function createMockClient(link?: ApolloLink) {
  return createClient({ link, mocks: TASKS_MOCKS });
}

interface TasksProps<TVariables = any> extends QueryHookOptions<TVariables> {
  query: DocumentNode;
}

function TaskList({ tasks }: { tasks: Array<{ id: number; text: string }> }) {
  return (
    <ul>
      {tasks.map(task => (
        <li key={task.id}>{task.text}</li>
      ))}
    </ul>
  );
}

function Tasks({ query, ...options }: TasksProps) {
  const { data, error, errors, loading } = useQuery(query, options);

  if (error) {
    return <>{error.message}</>;
  }

  if (errors) {
    return (
      <>
        {errors.map(x => (
          <Fragment key={x.message}>{x.message}</Fragment>
        ))}
      </>
    );
  }

  if (loading) {
    return <>Loading without suspense</>;
  }

  if (!data) {
    return <>Skipped loading of data</>;
  }

  return <TaskList tasks={data.tasks} />;
}

interface TasksWrapperProps extends TasksProps {
  client: ApolloClient<object>;
}

const SuspenseCompat = ({ children }: SuspenseProps) => <>{children}</>;

function TasksWrapper({ client, ...props }: TasksWrapperProps) {
  const SuspenseComponent = props.suspend !== false ? Suspense : SuspenseCompat;

  return (
    <ApolloProvider client={client}>
      <SuspenseComponent fallback={<>Loading</>}>
        <Tasks {...props} />
      </SuspenseComponent>
    </ApolloProvider>
  );
}

afterEach(cleanup);

it('should return the query data', async () => {
  const client = createMockClient();
  const { container } = render(
    <TasksWrapper client={client} query={TASKS_QUERY} />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Loading
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul>
    <li>
      Learn GraphQL
    </li>
    <li>
      Learn React
    </li>
    <li>
      Learn Apollo
    </li>
  </ul>
</div>
`);
});

it('should work with suspense disabled', async () => {
  const client = createMockClient();
  const { container } = render(
    <TasksWrapper client={client} suspend={false} query={TASKS_QUERY} />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Loading without suspense
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul>
    <li>
      Learn GraphQL
    </li>
    <li>
      Learn React
    </li>
    <li>
      Learn Apollo
    </li>
  </ul>
</div>
`);
});

it('should support query variables', async () => {
  const client = createMockClient();
  const { container } = render(
    <TasksWrapper
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: true }}
    />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Loading
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul>
    <li>
      Learn GraphQL
    </li>
  </ul>
</div>
`);
});

it('should support updating query variables', async () => {
  const client = createMockClient();
  const { container, rerender } = render(
    <TasksWrapper
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: true }}
    />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Loading
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul>
    <li>
      Learn GraphQL
    </li>
  </ul>
</div>
`);

  rerender(
    <TasksWrapper
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: false }}
    />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul
    style="display: none;"
  >
    <li>
      Learn GraphQL
    </li>
  </ul>
  Loading
</div>
`);

  // TODO: It doesn't pass if not invoked twice
  await flushEffectsAndWait();
  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul
    style=""
  >
    <li>
      Learn React
    </li>
    <li>
      Learn Apollo
    </li>
  </ul>
</div>
`);

  rerender(
    <TasksWrapper
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: true }}
    />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul
    style=""
  >
    <li>
      Learn GraphQL
    </li>
  </ul>
</div>
`);
});

it("shouldn't suspend if the data is already cached", async () => {
  const client = createMockClient();
  const { container, rerender } = render(
    <TasksWrapper
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: true }}
    />
  );

  await flushEffectsAndWait();

  rerender(
    <TasksWrapper
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: false }}
    />
  );

  await flushEffectsAndWait();

  rerender(
    <TasksWrapper
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: true }}
    />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul
    style=""
  >
    <li>
      Learn GraphQL
    </li>
  </ul>
</div>
`);
});

it("shouldn't allow a query with non-standard fetch policy with suspense", async () => {
  const client = createMockClient();
  const consoleErrorMock = jest
    .spyOn(console, 'error')
    .mockImplementation(noop);

  expect(() =>
    render(
      <TasksWrapper
        client={client}
        query={TASKS_QUERY}
        fetchPolicy="cache-and-network"
      />
    )
  ).toThrowErrorMatchingInlineSnapshot(
    `"Fetch policy cache-and-network is not supported without 'suspend: false'"`
  );

  expect(consoleErrorMock).toBeCalled();

  consoleErrorMock.mockRestore();
});

it("shouldn't ignore apollo errors in non-suspense mode", async () => {
  const client = createMockClient(linkReturningError);
  const { container } = render(
    <TasksWrapper client={client} query={TASKS_QUERY} />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Loading
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  Network error: Simulating network error
</div>
`);
});

it('should ignore apollo errors by default in non-suspense mode', async () => {
  const client = createMockClient(linkReturningError);
  const consoleLogMock = jest.spyOn(console, 'error').mockImplementation(noop);

  const { container } = render(
    <TasksWrapper client={client} suspend={false} query={TASKS_QUERY} />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Loading without suspense
</div>
`);

  expect(consoleLogMock).toBeCalledTimes(0);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  Network error: Simulating network error
</div>
`);

  consoleLogMock.mockRestore();
});

it('should allow a query with non-standard fetch policy without suspense', async () => {
  const client = createMockClient();
  const { container } = render(
    <TasksWrapper
      client={client}
      suspend={false}
      query={TASKS_QUERY}
      fetchPolicy="cache-and-network"
    />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Loading without suspense
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul>
    <li>
      Learn GraphQL
    </li>
    <li>
      Learn React
    </li>
    <li>
      Learn Apollo
    </li>
  </ul>
</div>
`);
});

it("shouldn't make obsolete renders in suspense mode", async () => {
  const client = createMockClient();
  const TasksWrapperWithProfiler = withProfiler(TasksWrapper);

  const { container, rerender } = render(
    <TasksWrapperWithProfiler
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: true }}
    />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Loading
</div>
`);

  expect(TasksWrapperWithProfiler).toHaveCommittedTimes(1);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul>
    <li>
      Learn GraphQL
    </li>
  </ul>
</div>
`);

  expect(TasksWrapperWithProfiler).toHaveCommittedTimes(1);

  rerender(
    <TasksWrapperWithProfiler
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: false }}
    />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul
    style="display: none;"
  >
    <li>
      Learn GraphQL
    </li>
  </ul>
  Loading
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul
    style=""
  >
    <li>
      Learn React
    </li>
    <li>
      Learn Apollo
    </li>
  </ul>
</div>
`);

  expect(TasksWrapperWithProfiler).toHaveCommittedTimes(
    3 // TODO: Figure out why.
  );

  rerender(
    <TasksWrapperWithProfiler
      client={client}
      query={FILTERED_TASKS_QUERY}
      variables={{ completed: true }}
    />
  );

  expect(TasksWrapperWithProfiler).toHaveCommittedTimes(1);

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul
    style=""
  >
    <li>
      Learn GraphQL
    </li>
  </ul>
</div>
`);

  await flushEffectsAndWait();

  expect(TasksWrapperWithProfiler).toHaveCommittedTimes(1);
});

it('skips query in suspense mode', async () => {
  const client = createMockClient();
  const { container } = render(
    <TasksWrapper client={client} skip query={TASKS_QUERY} />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Skipped loading of data
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  Skipped loading of data
</div>
`);
});

it('skips query in non-suspense mode', async () => {
  const client = createMockClient();
  const { container } = render(
    <TasksWrapper client={client} skip suspend={false} query={TASKS_QUERY} />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Skipped loading of data
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  Skipped loading of data
</div>
`);
});

it('starts skipped query in suspense mode', async () => {
  const client = createMockClient();
  const { rerender, container } = render(
    <TasksWrapper client={client} skip query={TASKS_QUERY} />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Skipped loading of data
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  Skipped loading of data
</div>
`);

  rerender(<TasksWrapper client={client} skip={false} query={TASKS_QUERY} />);

  expect(container).toMatchInlineSnapshot(`
<div>
  
  Loading
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul>
    <li>
      Learn GraphQL
    </li>
    <li>
      Learn React
    </li>
    <li>
      Learn Apollo
    </li>
  </ul>
</div>
`);
});

it('starts skipped query in non-suspense mode', async () => {
  const client = createMockClient();
  const { rerender, container } = render(
    <TasksWrapper client={client} skip suspend={false} query={TASKS_QUERY} />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Skipped loading of data
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  Skipped loading of data
</div>
`);

  rerender(
    <TasksWrapper
      client={client}
      skip={false}
      suspend={false}
      query={TASKS_QUERY}
    />
  );

  expect(container).toMatchInlineSnapshot(`
<div>
  Loading without suspense
</div>
`);

  await flushEffectsAndWait();

  expect(container).toMatchInlineSnapshot(`
<div>
  <ul>
    <li>
      Learn GraphQL
    </li>
    <li>
      Learn React
    </li>
    <li>
      Learn Apollo
    </li>
  </ul>
</div>
`);
});
