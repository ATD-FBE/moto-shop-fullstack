import React from 'react';
import cn from 'classnames';
import LimitSelect from '@/components/common/toolbar/PageLimitSelector.jsx';
import SortingControls from '@/components/common/toolbar/SortingControls.jsx';
import SearchControls from '@/components/common/toolbar/SearchControls.jsx';
import FilterControls from '@/components/common/toolbar/FilterControls.jsx';
import PaginationPages from '@/components/common/toolbar/PaginationPages.jsx';
import PaginationInfo from '@/components/common/toolbar/PaginationInfo.jsx';

export default function Toolbar({
    position = '',
    activeControls = [],
    uiBlocked,
    initDataReady,
    loadStatus,
    search,
    setSearch,
    searchPlaceholder,
    filter,
    setFilter,
    filterOptions,
    sort,
    setSort,
    sortOptions,
    page,
    setPage,
    limit,
    setLimit,
    limitOptions,
    totalItems,
    label
}) {
    return (
        <div className={cn('toolbar', position)}>
            {activeControls.map((controls, idx) => {
                switch (controls) {
                    case 'limit':
                        return (
                            <LimitSelect
                                key={`${idx}-${controls}`}
                                uiBlocked={uiBlocked}
                                options={limitOptions}
                                limit={limit}
                                setLimit={setLimit}
                                page={page}
                                setPage={setPage}
                                totalItems={totalItems}
                            />
                        );

                    case 'sort':
                        return (
                            <SortingControls
                                key={`${idx}-${controls}`}
                                uiBlocked={uiBlocked}
                                options={sortOptions}
                                sort={sort}
                                setSort={setSort}
                            />
                        );

                    case 'search':
                        return (
                            <SearchControls
                                key={`${idx}-${controls}`}
                                placeholder={searchPlaceholder}
                                uiBlocked={uiBlocked}
                                search={search}
                                setSearch={setSearch}
                            />
                        );

                    case 'filter':
                        return (
                            <FilterControls
                                key={`${idx}-${controls}`}
                                uiBlocked={uiBlocked}
                                options={filterOptions}
                                filter={filter}
                                setFilter={setFilter}
                            />
                        );

                    case 'pages':
                        return (
                            <PaginationPages
                                key={`${idx}-${controls}`}
                                uiBlocked={uiBlocked}
                                initDataReady={initDataReady}
                                currentPage={page}
                                totalItems={totalItems}
                                limit={limit}
                                setPage={setPage}
                            />
                        );

                    case 'info':
                        return (
                            <PaginationInfo
                                key={`${idx}-${controls}`}
                                loadStatus={loadStatus}
                                page={page}
                                limit={limit}
                                totalItems={totalItems}
                                label={label}
                            />
                        );

                    default:
                        return null;
                }
            })}
        </div>
    );
};
