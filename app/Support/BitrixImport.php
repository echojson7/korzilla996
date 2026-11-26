<?php

namespace App\Support;

use App\Models\CrmDeal;
use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use Illuminate\Support\Facades\DB;

/**
 * Перенос настроек CRM из Битрикс24: воронки сделок, стадии и поля
 * (стандартные справочники и пользовательские UF_CRM_…). Источник —
 * ответы REST (crm.category.list + crm.status.list в deal-stages.json,
 * crm.deal.fields в deal-fields.json), копия лежит в database/bitrix24.
 *
 * Повторный запуск ничего не плодит: всё ищется по ключу Битрикса
 * (external_id / external_code). Стадии обновляются по Битриксу, а у полей,
 * которые уже есть, меняются только варианты списков — правки
 * администратора (название, блок, «выключено») не теряются.
 */
class BitrixImport
{
    /** Типы полей Битрикса → наши; null — не переносим (будет на этапе 2). */
    private const TYPES = [
        'string' => 'string', 'integer' => 'number', 'double' => 'number', 'date' => 'date', 'datetime' => 'datetime',
        'boolean' => 'boolean', 'enumeration' => 'list', 'employee' => 'user', 'url' => 'url', 'address' => 'string', 'file' => 'file',
        'crm' => null, 'iblock_element' => null, 'resourcebooking' => null, 'money' => 'number',
    ];

    /** Тестовые и устаревшие поля: переносятся выключенными. */
    private const JUNK = [
        '/^UF_CRM_/u', '/^sdsdsds$/u', '/^Тов2$/u', '/^Товары$/u', '/^test /iu', '/^Новое число$/u', '/тест/iu', '/^протокол$/u',
        '/^График/u', '/^Текущий$/u', '/^План дата$/u', '/^Избранное$/u', '/^стадия \d$/u', '/^ХХ/u', '/_WZ$/u',
        '/^Контакт (ICQ|Jabber|MSN|Skype|Viber|Facebook|Битрикс24|Открытая линия)/u', '/^Номер (пейджера|факса)$/u',
        '/^Микроблог/u', '/^Страница Facebook$/u', '/^Площадка1$/u', '/Удален в 1С/u',
    ];

    /** Блоки карточки по словам в названии. Первое совпадение. */
    private const SECTIONS = [
        'Анкета качества' => '/Довольны|порекомендуете|отзыв/iu',
        'Договор' => '/договор|Директор|Исполнитель|Лицензиат|ЭДО|предоплаты|Способ оплаты|Абонентская|Срок действия КП|Расценка/iu',
        'Продвижение' => '/продвиж|SEO|стоп|Ограничение суммы|Город|регион|Поисковики|Цена за посетителя|День отчета|Метрика|2ГИС|страниц|Разделы сайта/iu',
        'Сайт' => '/сайт|ТЗ|Материалы|Скрины|Дизайнер|Технолог|Тематика|разделов каталога|SSL|домен/iu',
        'Реквизиты' => '/ИНН|ОКВЭД|Деятельность|адрес/iu',
        'Битрикс24 и лицензии' => '/Б24|Битрикс24|Лицензи|Биткэт|оплаченных месяцев|Дата окончания тарифа/iu',
    ];

    public array $report = ['pipelines' => 0, 'stages' => 0, 'fields' => 0, 'skipped' => []];

    public function run(array $stages, array $fields): array
    {
        DB::transaction(function () use ($stages, $fields) {
            $this->pipelines($stages);
            $this->fields($fields, $stages['statuses'] ?? []);
        });

        return $this->report;
    }

    private function pipelines(array $data): void
    {
        $categories = $data['categories']['result']['categories'] ?? $data['categories']['categories'] ?? $data['categories'] ?? [];
        $statuses = collect($data['statuses'] ?? []);
        foreach ($categories as $category) {
            $id = (string) $category['id'];
            $pipeline = CrmPipeline::query()->firstOrNew(['entity' => 'deal', 'external_id' => $id]);
            $this->report['pipelines'] += $pipeline->exists ? 0 : 1;
            $pipeline->fill(['title' => $category['name'], 'sort' => (int) $category['sort']])->save();

            $entity = $id === '0' ? 'DEAL_STAGE' : 'DEAL_STAGE_'.$id;
            foreach ($statuses->where('ENTITY_ID', $entity)->sortBy(fn ($one) => (int) $one['SORT']) as $status) {
                $semantic = $status['EXTRA']['SEMANTICS'] ?? $status['SEMANTICS'] ?? 'process';
                $stage = CrmStage::query()->firstOrNew(['pipeline_id' => $pipeline->id, 'external_id' => $status['STATUS_ID']]);
                $this->report['stages'] += $stage->exists ? 0 : 1;
                $stage->fill([
                    'title' => $status['NAME'],
                    'color' => $this->color($status['COLOR'] ?? $status['EXTRA']['COLOR'] ?? null),
                    'semantic' => match ($semantic) { 'success', 'S' => 'success', 'failure', 'apology', 'F' => 'failure', default => 'process' },
                    'sort' => (int) $status['SORT'],
                ])->save();
            }
        }

        /* Своя воронка «Общая» из миграции не нужна, если в ней пусто. */
        $own = CrmPipeline::query()->where('entity', 'deal')->whereNull('external_id')->get();
        foreach ($own as $pipeline) {
            if (CrmDeal::query()->where('pipeline_id', $pipeline->id)->doesntExist()) {
                $pipeline->delete();
            }
        }
        if (CrmPipeline::query()->where('entity', 'deal')->where('is_default', true)->doesntExist()) {
            CrmPipeline::query()->where('entity', 'deal')->orderBy('sort')->orderBy('id')->limit(1)->update(['is_default' => true]);
        }
    }

    private function fields(array $data, array $statuses): void
    {
        $fields = $data['result'] ?? $data;
        $statuses = collect($statuses);
        $list = fn (string $entity) => $statuses->where('ENTITY_ID', $entity)->sortBy(fn ($one) => (int) $one['SORT'])
            ->map(fn ($one) => ['id' => (string) $one['STATUS_ID'], 'label' => $one['NAME']])->values()->all();

        /* Стандартные поля Битрикса, которых нет среди колонок сделки. */
        $standard = [
            'TYPE_ID' => ['type', 'Тип сделки', 'list', $list('DEAL_TYPE'), true],
            'SOURCE_ID' => ['source', 'Источник', 'list', $list('SOURCE'), true],
            'SOURCE_DESCRIPTION' => ['source_info', 'Дополнительно об источнике', 'text', null, true],
            'BEGINDATE' => ['begin_date', 'Дата начала', 'date', null, true],
            'PROBABILITY' => ['probability', 'Вероятность, %', 'number', null, false],
            'UTM_SOURCE' => ['utm_source', 'UTM: источник', 'string', null, false],
            'UTM_MEDIUM' => ['utm_medium', 'UTM: тип трафика', 'string', null, false],
            'UTM_CAMPAIGN' => ['utm_campaign', 'UTM: кампания', 'string', null, false],
            'UTM_CONTENT' => ['utm_content', 'UTM: содержание', 'string', null, false],
            'UTM_TERM' => ['utm_term', 'UTM: ключевое слово', 'string', null, false],
        ];
        $sort = 10;
        foreach ($standard as $external => [$code, $title, $type, $options, $active]) {
            if (! isset($fields[$external])) {
                continue;
            }
            $this->field($external, [
                'code' => $code, 'title' => $title, 'type' => $type, 'options' => $options, 'active' => $active,
                'section' => $external === 'UTM_SOURCE' || str_starts_with($external, 'UTM_') ? 'UTM-метки' : 'О сделке',
                'show_in_list' => $code === 'source', 'sort' => $sort += 10,
            ]);
        }

        foreach ($fields as $external => $one) {
            if (! str_starts_with($external, 'UF_CRM_')) {
                continue;
            }
            $type = self::TYPES[$one['type']] ?? null;
            $title = trim((string) ($one['listLabel'] ?? $one['formLabel'] ?? '')) ?: $external;
            if ($type === null) {
                $this->report['skipped'][] = "{$title} ({$one['type']})";

                continue;
            }
            $options = $type === 'list' ? collect($one['items'] ?? [])->map(fn ($item) => ['id' => (string) $item['ID'], 'label' => trim((string) $item['VALUE'])])
                ->unique('label')->values()->all() : null;
            $junk = collect(self::JUNK)->contains(fn ($re) => preg_match($re, $title));
            $section = collect(self::SECTIONS)->search(fn ($re) => preg_match($re, $title)) ?: null;
            $this->field($external, [
                'code' => strtolower($external), 'title' => $title, 'type' => $type, 'options' => $options,
                'multiple' => (bool) ($one['isMultiple'] ?? false) || $type === 'file', 'required' => false,
                'active' => ! $junk, 'section' => $section, 'sort' => $sort += 10,
                'show_in_list' => $external === 'UF_CRM_1547064684753',
            ]);
        }
    }

    private function field(string $external, array $data): void
    {
        $field = CrmField::query()->where('entity', 'deal')->where('external_code', $external)->first();
        if ($field) {
            if ($data['type'] === 'list' && $data['options']) {
                /* Новые варианты из Битрикса — в конец, свои не трогаем. */
                $known = collect($field->options ?? [])->pluck('id')->all();
                $field->options = array_merge($field->options ?? [], array_values(array_filter($data['options'], fn ($one) => ! in_array($one['id'], $known, true))));
                $field->save();
            }

            return;
        }
        CrmField::query()->create($data + ['entity' => 'deal', 'external_code' => $external]);
        $this->report['fields']++;
    }

    private function color(?string $hex): string
    {
        return $hex && preg_match('/^#[0-9a-f]{6}$/i', $hex) ? strtolower($hex) : '#39a8ef';
    }
}
