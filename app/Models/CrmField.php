<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrmField extends Model
{
    public const TYPES = [
        'string' => 'Строка',
        'text' => 'Текст',
        'number' => 'Число',
        'date' => 'Дата',
        'datetime' => 'Дата и время',
        'boolean' => 'Да / нет',
        'list' => 'Список',
        'user' => 'Сотрудник',
        'url' => 'Ссылка',
        'file' => 'Файл',
    ];

    protected $fillable = [
        'entity', 'code', 'title', 'type', 'multiple', 'required', 'options', 'section', 'sort',
        'show_in_list', 'show_on_kanban', 'active', 'external_code',
    ];

    protected function casts(): array
    {
        return [
            'multiple' => 'boolean',
            'required' => 'boolean',
            'options' => 'array',
            'sort' => 'integer',
            'show_in_list' => 'boolean',
            'show_on_kanban' => 'boolean',
            'active' => 'boolean',
        ];
    }
}
