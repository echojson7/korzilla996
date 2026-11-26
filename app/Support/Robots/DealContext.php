<?php

namespace App\Support\Robots;

use App\Models\CrmCompany;
use App\Models\CrmContact;
use App\Models\CrmDeal;
use App\Models\CrmField;
use App\Models\CrmPipeline;
use App\Models\CrmStage;
use App\Models\User;
use App\Support\CrmFields;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Сделка глазами робота: значения для условий (по машинным ключам) и для
 * подстановок в текст ({{Название}}, {{Компания}}, {{uf_crm_…}} или
 * {{Название своего поля}}). Всё грузится лениво и один раз на запуск.
 */
class DealContext
{
    /** Ключи условий: ключ => [название, тип]. Свои поля — их code. */
    public const KEYS = [
        'title' => ['Название', 'string'],
        'amount' => ['Сумма', 'number'],
        'stage_id' => ['Стадия', 'stage'],
        'responsible_id' => ['Ответственный', 'user'],
        'creator_id' => ['Создатель', 'user'],
        'company' => ['Компания', 'string'],
        'contact' => ['Контакт', 'string'],
        'products' => ['Товары (названия)', 'string'],
        'products_count' => ['Количество товаров', 'number'],
        'close_date' => ['Дата завершения', 'date'],
        'comments' => ['Комментарий', 'text'],
    ];

    /** Подстановки: название в {{…}} => как получить. */
    public const PLACEHOLDERS = [
        'ID', 'Название', 'Сумма', 'Валюта', 'Воронка', 'Стадия', 'Ответственный', 'Почта ответственного', 'Создатель',
        'Компания', 'Телефон компании', 'Почта компании', 'Сайт компании', 'Контакт', 'Телефон контакта', 'Почта контакта',
        'Товары', 'Количество товаров', 'Дата завершения', 'Комментарий', 'Ссылка', 'Сегодня',
    ];

    private ?Collection $fields = null;

    private ?CrmCompany $companyRecord = null;

    private ?CrmContact $contactRecord = null;

    private ?array $productRows = null;

    private bool $loaded = false;

    public function __construct(public CrmDeal $deal) {}

    public function fields(): Collection
    {
        return $this->fields ??= CrmField::query()->where('entity', 'deal')->get()->keyBy('code');
    }

    public function field(string $code): ?CrmField
    {
        return $this->fields()->get($code);
    }

    /** Свежая сделка после правки роботом. */
    public function refresh(): void
    {
        $this->deal->refresh();
        $this->loaded = false;
        $this->productRows = null;
    }

    private function load(): void
    {
        if ($this->loaded) {
            return;
        }
        $this->loaded = true;
        $this->companyRecord = $this->deal->company_id ? CrmCompany::query()->find($this->deal->company_id) : null;
        $this->contactRecord = $this->deal->contact_id ? CrmContact::query()->find($this->deal->contact_id) : null;
    }

    private function products(): array
    {
        return $this->productRows ??= DB::table('crm_product_rows')->where('owner_type', 'deal')->where('owner_id', $this->deal->id)
            ->orderBy('sort')->orderBy('id')->pluck('name')->map(fn ($name) => (string) $name)->all();
    }

    /** Значение для условия: число, строка, id или массив id. */
    public function value(string $key): mixed
    {
        $deal = $this->deal;
        $this->load();

        return match ($key) {
            'title' => $deal->title,
            'amount' => (float) $deal->amount,
            'stage_id' => (int) $deal->stage_id,
            'pipeline_id' => (int) $deal->pipeline_id,
            'responsible_id' => $deal->responsible_id ? (int) $deal->responsible_id : null,
            'creator_id' => $deal->creator_id ? (int) $deal->creator_id : null,
            'company' => $this->companyRecord?->title ?? $deal->company,
            'contact' => $this->contactRecord?->name ?? $deal->contact,
            'products' => implode("\n", $this->products()),
            'products_count' => count($this->products()),
            'close_date' => $deal->close_date?->toDateString(),
            'comments' => $deal->comments,
            default => ($deal->fields ?? [])[$key] ?? null,
        };
    }

    /** Текст для {{ключ}}; null — ключ неизвестен. */
    public function text(string $key): ?string
    {
        $deal = $this->deal;
        $this->load();
        $key = trim($key);
        $first = fn ($list) => is_array($list) && $list ? (string) (is_array($list[0]) ? ($list[0]['value'] ?? $list[0]['VALUE'] ?? reset($list[0])) : $list[0]) : '';

        $core = match (mb_strtolower($key)) {
            'id' => (string) $deal->id,
            'название' => $deal->title,
            'сумма' => rtrim(rtrim(number_format((float) $deal->amount, 2, '.', ''), '0'), '.'),
            'валюта' => $deal->currency,
            'воронка' => (string) CrmPipeline::query()->whereKey($deal->pipeline_id)->value('title'),
            'стадия' => (string) CrmStage::query()->whereKey($deal->stage_id)->value('title'),
            'ответственный' => (string) User::query()->whereKey($deal->responsible_id)->value('name'),
            'почта ответственного' => (string) User::query()->whereKey($deal->responsible_id)->value('email'),
            'создатель' => (string) User::query()->whereKey($deal->creator_id)->value('name'),
            'компания' => (string) ($this->companyRecord?->title ?? $deal->company),
            'телефон компании' => $first($this->companyRecord?->phones),
            'почта компании' => $first($this->companyRecord?->emails),
            'сайт компании' => $first($this->companyRecord?->webs),
            'контакт' => (string) ($this->contactRecord?->name ?? $deal->contact),
            'телефон контакта' => $first($this->contactRecord?->phones),
            'почта контакта' => $first($this->contactRecord?->emails),
            'товары' => implode(', ', $this->products()),
            'количество товаров' => (string) count($this->products()),
            'дата завершения' => $deal->close_date?->format('d.m.Y') ?? '',
            'комментарий' => (string) $deal->comments,
            'ссылка' => rtrim((string) config('app.url'), '/').'/portal/#/deals?open='.$deal->id,
            'сегодня' => now()->format('d.m.Y'),
            default => null,
        };
        if ($core !== null) {
            return $core;
        }
        $field = $this->field(mb_strtolower($key)) ?? $this->fields()->first(fn (CrmField $one) => mb_strtolower($one->title) === mb_strtolower($key));

        return $field ? (string) CrmFields::text($field, ($deal->fields ?? [])[$field->code] ?? null) : null;
    }
}
